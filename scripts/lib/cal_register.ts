// cal register サブコマンド: 指定した作品（URL または作品ID）を厳選アンカー方式で収集する。
// 既存の収集経路（collectWork）をそのまま呼ぶ薄い入口で、新しい収集経路は作らない。原本の
// 凍結保存・dataset 追記・レート制限（1秒間隔・作品あたり最大2話）は collectWork 側が強制する。
// 既収集の作品は既定でスキップ（--recapture で別スナップショット取得）。

import { FETCH_INTERVAL_MS, FETCH_TIMEOUT_MS } from "../../src/shared/constants.ts";
import { sleep } from "../../src/shared/async.ts";
import { initTokenizer, tokenize } from "../../src/domain/tokenizer/mod.ts";
import { analyzeAll } from "../../src/domain/analyzer/mod.ts";
import { parseTargetUrl } from "../../src/background/fetchers/kakuyomu.ts";
import { type DatasetRecord, loadDataset, seenWorkIds } from "./dataset.ts";
import { type CollectDeps, collectWork, enforceRateLimits } from "./collect.ts";
import { CANONICAL_FORMULA, evaluateRecord } from "./cal_evaluate.ts";

const DEFAULT_OUT = ".agents/runtime/dataset.jsonl";
const DEFAULT_PAGES_DIR = ".agents/runtime";
const DEFAULT_MAX_EPISODES = 2;

export interface RegisterOptions {
  targets: string[];
  interval: number;
  maxEpisodes: number;
  out: string;
  pagesDir: string;
  tags: string[];
  recapture: boolean;
}

export interface RegisterResult {
  workId: string;
  captureId: string;
  score: number;
  title: string;
}

// 収集直後の表示用サマリ。表示スコアは正本式で rawMetrics から再計算する。収集時に保存した
// record.score は化石化するため使わない（評価・詳細・一覧と同じ再計算経路を通す）。
export function registerResultOf(record: DatasetRecord, captureId: string): RegisterResult {
  return {
    workId: record.workId,
    captureId,
    score: evaluateRecord(record, CANONICAL_FORMULA).score,
    title: record.title,
  };
}

export function parseRegisterArgs(argv: string[]): RegisterOptions {
  const targets: string[] = [];
  const tags: string[] = [];
  let interval = FETCH_INTERVAL_MS;
  let maxEpisodes = DEFAULT_MAX_EPISODES;
  let out = DEFAULT_OUT;
  let pagesDir = DEFAULT_PAGES_DIR;
  let recapture = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--interval") interval = Number(argv[++i]);
    else if (a === "--max-episodes") maxEpisodes = Number(argv[++i]);
    else if (a === "--out") out = argv[++i];
    else if (a === "--pages-dir") pagesDir = argv[++i];
    else if (a === "--tag") tags.push(argv[++i]);
    else if (a === "--recapture") recapture = true;
    else targets.push(a);
  }
  return { targets, interval, maxEpisodes, out, pagesDir, tags, recapture };
}

// URL でも数値IDでも作品IDに正規化する。数値以外は弾く（不正な作品IDでパスを汚染しない）。
export function resolveWorkId(target: string): string {
  const workId = /^\d+$/.test(target) ? target : parseTargetUrl(target).workId;
  if (!/^\d+$/.test(workId)) throw new Error(`Invalid workId: ${target}`);
  return workId;
}

function httpGet(url: string): Promise<{ status: number; text: string }> {
  return fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "Mozilla/5.0 (compatible; novel-quality-filter/collect)" },
  }).then(async (res) => ({ status: res.status, text: await res.text() }));
}

export async function runRegister(argv: string[]): Promise<number> {
  const opts = parseRegisterArgs(argv);
  if (opts.targets.length === 0) {
    console.error("使い方: deno task cal register <url|workId>... [--tag NAME] [--recapture]");
    return 1;
  }

  await initTokenizer();
  // 作品ページ取得〜作品間スリープまで含め、レート制限を境界で矯正した値に統一する。
  const bounds = enforceRateLimits(opts.interval, opts.maxEpisodes);
  const deps: CollectDeps = {
    httpGet,
    sleep,
    now: () => new Date(),
    computeRawMetrics: (text) => analyzeAll(text, tokenize(text), tokenize),
    baseDir: opts.pagesDir,
    datasetPath: opts.out,
    intervalMs: bounds.intervalMs,
    maxEpisodeFetch: bounds.maxEpisodeFetch,
  };

  const seen = seenWorkIds(await loadDataset(opts.out));
  let added = 0, skipped = 0, failed = 0;
  for (const target of opts.targets) {
    let workId: string;
    try {
      workId = resolveWorkId(target);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${target}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (seen.has(workId) && !opts.recapture) {
      skipped++;
      console.log(`  - ${workId}: 既収集（--recapture で再取得）`);
      continue;
    }
    try {
      const { record, captureId } = await collectWork(workId, opts.tags, deps);
      const result = registerResultOf(record, captureId);
      added++;
      seen.add(workId);
      console.log(`  ✓ ${result.score} ${result.title.slice(0, 30)} [${result.captureId}]`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${workId}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(bounds.intervalMs);
  }
  console.log(`\n完了: 新規${added}件 / スキップ${skipped}件 / 失敗${failed}件`);
  return failed > 0 && added === 0 ? 1 : 0;
}
