// deno task collect: 指定した作品（URL または作品ID）を厳選アンカー方式で収集する。
// 冒頭数話を取得→健全性検証→生HTML＋manifest を原本として保存→rederive で数値算出→
// dataset に追記。レート制限（1秒間隔・作品あたり最大2話取得）を厳守し、live サイトへの
// 過剰アクセスを避ける。既収集の作品は既定でスキップ（--recapture で別スナップショット取得）。
//
// Usage: deno task collect <url|workId>... [--interval MS] [--max-episodes N]
//                                          [--out PATH] [--pages-dir DIR] [--tag NAME] [--recapture]

import { FETCH_INTERVAL_MS, FETCH_TIMEOUT_MS } from "../src/shared/constants.ts";
import { sleep } from "../src/shared/async.ts";
import { initTokenizer, tokenize } from "../src/domain/tokenizer/mod.ts";
import { analyzeAll } from "../src/domain/analyzer/mod.ts";
import { parseTargetUrl } from "../src/background/fetchers/kakuyomu.ts";
import { loadDataset, seenWorkIds } from "./lib/dataset.ts";
import { type CollectDeps, collectWork } from "./lib/collect.ts";

const DEFAULT_OUT = ".agents/runtime/dataset.jsonl";
const DEFAULT_PAGES_DIR = ".agents/runtime";
const DEFAULT_MAX_EPISODES = 2;

interface Options {
  targets: string[];
  interval: number;
  maxEpisodes: number;
  out: string;
  pagesDir: string;
  tags: string[];
  recapture: boolean;
}

function parseArgs(argv: string[]): Options {
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
function resolveWorkId(target: string): string {
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

async function main(): Promise<void> {
  const opts = parseArgs(Deno.args);
  if (opts.targets.length === 0) {
    console.error("使い方: deno task collect <url|workId>... [--tag NAME] [--recapture]");
    Deno.exit(1);
  }

  await initTokenizer();
  const deps: CollectDeps = {
    httpGet,
    sleep,
    now: () => new Date(),
    computeRawMetrics: (text) => analyzeAll(text, tokenize(text), tokenize),
    baseDir: opts.pagesDir,
    datasetPath: opts.out,
    intervalMs: opts.interval,
    maxEpisodeFetch: opts.maxEpisodes,
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
      added++;
      seen.add(workId);
      console.log(`  ✓ ${record.score} ${record.title.slice(0, 30)} [${captureId}]`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${workId}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(opts.interval);
  }
  console.log(`\n完了: 新規${added}件 / スキップ${skipped}件 / 失敗${failed}件`);
}

await main();
