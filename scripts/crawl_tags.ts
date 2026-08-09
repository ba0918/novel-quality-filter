// 較正クロール: タグ×更新順ページを巡回し、無作為抽出した作品を本番パイプラインで採点、
// 生指標ごと JSONL に追記する。溜めたデータで式・ペナルティ実験（analyze_dataset.ts）を回す。
//
// Usage: deno task crawl [tag...] [--pages N] [--max N] [--interval MS] [--out PATH]
//   tag...      : シードタグ（省略時は既定リスト）
//   --pages N   : 各タグで辿る更新順ページ数（既定 1、1頁≒50作品）
//   --max N     : この実行で新規採点する作品数の上限（既定 50）
//   --interval  : 作品／ページ取得の間隔ミリ秒（既定 2000。カクヨムへの礼儀）
//   --out PATH  : データセット JSONL（既定 .agents/runtime/dataset.jsonl）
//
// 既取得 workId は out から復元してスキップ＝再開可能。取得失敗（削除/年齢制限/話なし）は
// ログして継続（データセットには成功分のみ）。

import { sleep } from "../src/shared/async.ts";
import { initTokenizer } from "../src/domain/tokenizer/mod.ts";
import { analyzeWork, fetchText } from "./lib/analyze_core.ts";
import { extractWorkIds } from "./lib/kakuyomu_listing.ts";
import { appendRecord, type DatasetRecord, loadDataset, seenWorkIds } from "./lib/dataset.ts";

const DEFAULT_TAGS = [
  "異世界",
  "美少女",
  "ハイファンタジー",
  "悪役転生",
  "主人公最強",
  "ざまぁ",
  "TS",
  "ガールズラブ",
  "配信",
  "VRMMO",
  "AI本文利用",
  "AI補助",
  "曇らせ",
  "ハーレム",
];
const DEFAULT_OUT = ".agents/runtime/dataset.jsonl";

interface Options {
  tags: string[];
  pages: number;
  max: number;
  interval: number;
  out: string;
}

function parseArgs(argv: string[]): Options {
  const tags: string[] = [];
  let pages = 1, max = 50, interval = 2000, out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pages") pages = Number(argv[++i]);
    else if (a === "--max") max = Number(argv[++i]);
    else if (a === "--interval") interval = Number(argv[++i]);
    else if (a === "--out") out = argv[++i];
    else tags.push(a);
  }
  return { tags: tags.length > 0 ? tags : DEFAULT_TAGS, pages, max, interval, out };
}

function listingUrl(tag: string, page: number): string {
  const base = `https://kakuyomu.jp/tags/${encodeURIComponent(tag)}`;
  return `${base}?order=last_episode_published_at&page=${page}`;
}

// Fisher-Yates。更新順 firehose を無作為化し、上限内でタグ横断の広がりを得る。
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// タグ×ページを掃いて (workId, 初出タグ) を集める。既取得・実行内重複は除外。
async function collectCandidates(opts: Options, seen: Set<string>): Promise<Map<string, string>> {
  const candidates = new Map<string, string>(); // workId -> 初出タグ
  for (const tag of opts.tags) {
    for (let page = 1; page <= opts.pages; page++) {
      try {
        const html = await fetchText(listingUrl(tag, page));
        for (const id of extractWorkIds(html)) {
          if (!seen.has(id) && !candidates.has(id)) candidates.set(id, tag);
        }
      } catch (e) {
        console.error(`  ✗ 一覧取得失敗 [${tag} p${page}]: ${e instanceof Error ? e.message : e}`);
      }
      await sleep(opts.interval);
    }
  }
  return candidates;
}

// 通過は本番と同じ score>40（40ちょうどは除外）。
function quadrant(r: DatasetRecord): "FP容疑" | "FN予備軍" | "" {
  const { singleSentParaRatio: ratio, sentenceLengthSD: sd } = r.rawMetrics;
  if (r.score > 40 && ratio > 0.70 && sd >= 15) return "FP容疑"; // 複合すり抜けの通過
  if (r.score <= 40 && ratio > 0.70 && sd >= 13 && sd < 15) return "FN予備軍"; // 崩界クラス
  return "";
}

// 平均文長（字/文）。非散文ブロック（ステータス表・掲示板）が長文に化けると跳ねる汚染プロキシ。
function meanSentenceLen(r: DatasetRecord): number {
  return r.rawMetrics.sentenceCount > 0 ? r.rawMetrics.charCount / r.rawMetrics.sentenceCount : 0;
}

async function main(): Promise<void> {
  const opts = parseArgs(Deno.args);
  console.log(
    `タグ ${opts.tags.length}件 / 各${opts.pages}頁 / 上限${opts.max}作品 / 間隔${opts.interval}ms → ${opts.out}`,
  );

  const existing = await loadDataset(opts.out);
  const seen = seenWorkIds(existing);
  console.log(`既存データセット: ${existing.length}件（workId重複はスキップ）`);

  await initTokenizer();

  const candidates = shuffle([...(await collectCandidates(opts, seen))]).slice(0, opts.max);
  console.log(`新規候補: ${candidates.length}件を採点する\n`);

  let added = 0, failed = 0;
  const flagged: DatasetRecord[] = [];
  for (const [workId, tag] of candidates) {
    try {
      const r = await analyzeWork(`https://kakuyomu.jp/works/${workId}`, false);
      const rec: DatasetRecord = {
        workId,
        url: `https://kakuyomu.jp/works/${workId}`,
        title: r.meta.title,
        author: r.meta.author,
        reviewCount: r.meta.reviewCount,
        totalReviewPoint: r.meta.totalReviewPoint,
        totalCharacterCount: r.meta.totalCharacterCount,
        openingType: r.openingType,
        sampledCount: r.sampledCount,
        episodeUrl: r.episodeUrl,
        score: r.score,
        rawMetrics: r.rawMetrics,
        blankLineRatio: r.blankLineRatio,
        tags: [tag],
        crawledAt: new Date().toISOString(),
      };
      await appendRecord(opts.out, rec);
      added++;
      const q = quadrant(rec);
      const mark = q ? ` ⟵ ${q}` : "";
      console.log(
        `  ✓ [${tag}] ${r.score} ${r.meta.title.slice(0, 24)} (比率${
          r.rawMetrics.singleSentParaRatio.toFixed(2)
        }/SD${r.rawMetrics.sentenceLengthSD.toFixed(1)})${mark}`,
      );
      if (q) flagged.push(rec);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${workId}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(opts.interval);
  }

  console.log(`\n完了: 新規${added}件 / 失敗${failed}件 / 総計${existing.length + added}件`);
  if (flagged.length > 0) {
    console.log(`\n=== 要チェック候補 ${flagged.length}件 ===`);
    for (const r of flagged) {
      console.log(
        `  ${quadrant(r)}: [${r.tags[0]}] ${r.score} 平均${
          meanSentenceLen(r).toFixed(0)
        }字/文 ${r.title}\n    ${r.url}`,
      );
    }
  }
}

await main();
