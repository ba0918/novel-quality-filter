// カクヨム作品を URL 一本でメタデータ取得＋スコアリングする較正用ツール。
// Usage: deno task analyze <url...> [--csv] [--episode]
//   url      : 作品 or エピソードの URL（複数可。既定はどの話 URL でも作品の第1話から評価）
//   --csv    : 集計用に CSV を末尾へ出力する
//   --episode: 渡したエピソードをそのまま採点（開幕サンプリングを迂回）。
//              長編の1話 vs 後半話で文体ドリフトを比較する調査用
//
// 採点対象話の決定・採点はパイプライン核 analyze_core.ts に委譲する（crawl_tags.ts と共有）。
// 空行率は観測専用の診断カラムで、スコアには算入しない。

import { FETCH_INTERVAL_MS } from "../src/shared/constants.ts";
import { sleep } from "../src/shared/async.ts";
import { initTokenizer } from "../src/domain/tokenizer/mod.ts";
import { type AnalyzeResult, analyzeWork } from "./lib/analyze_core.ts";

const THRESHOLD = 40;

function verdict(score: number): string {
  return score > THRESHOLD ? "⭕通過" : "❌除外";
}

function printDetail(r: AnalyzeResult): void {
  const m = r.meta;
  console.log(`\n■ ${m.title}${m.author ? `（${m.author}）` : ""}`);
  console.log(
    `  レビュー ${m.reviewCount} / 評価pt ${m.totalReviewPoint} / 総文字 ${m.totalCharacterCount}`,
  );
  console.log(`  第1話「${r.firstEpisodeTitle}」`);
  console.log(
    `  開幕形式 ${r.openingType}（${r.sampledCount}話サンプル）→ 採点話 ${r.episodeUrl}`,
  );
  console.log(`  スコア ${r.score} ${verdict(r.score)}`);
  console.log(
    `  指標: 一文段落率 ${r.rawMetrics.singleSentParaRatio.toFixed(3)} / 文長SD ${
      r.rawMetrics.sentenceLengthSD.toFixed(1)
    } / バースティ ${r.rawMetrics.sentenceLengthBurstiness.toFixed(1)} / 空行率 ${
      r.blankLineRatio.toFixed(3)
    }（観測のみ）`,
  );
}

function printTable(rows: AnalyzeResult[]): void {
  console.log(`\n=== 比較テーブル（閾値 ${THRESHOLD}）===`);
  console.log(
    "タイトル                       レビュー  スコア  一文段落率  文長SD  空行率  開幕形式",
  );
  for (const r of rows) {
    const title = r.meta.title.length > 28 ? r.meta.title.slice(0, 27) + "…" : r.meta.title;
    console.log(
      `${title.padEnd(30)} ${String(r.meta.reviewCount).padStart(7)} ${
        String(r.score).padStart(5)
      } ${r.rawMetrics.singleSentParaRatio.toFixed(3).padStart(9)} ${
        r.rawMetrics.sentenceLengthSD.toFixed(1).padStart(7)
      } ${r.blankLineRatio.toFixed(3).padStart(6)}  ${r.openingType}`,
    );
  }
}

function printCsv(rows: AnalyzeResult[]): void {
  console.log("\n=== CSV ===");
  console.log(
    "title,author,reviewCount,totalReviewPoint,totalCharacterCount,openingType,sampledCount,score,singleSentParaRatio,sentenceLengthSD,burstiness,blankLineRatio,episodeUrl",
  );
  for (const r of rows) {
    const m = r.meta;
    const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
    console.log([
      cell(m.title),
      cell(m.author),
      m.reviewCount,
      m.totalReviewPoint,
      m.totalCharacterCount,
      r.openingType,
      r.sampledCount,
      r.score,
      r.rawMetrics.singleSentParaRatio.toFixed(4),
      r.rawMetrics.sentenceLengthSD.toFixed(4),
      r.rawMetrics.sentenceLengthBurstiness.toFixed(4),
      r.blankLineRatio.toFixed(4),
      cell(r.episodeUrl),
    ].join(","));
  }
}

async function main(): Promise<void> {
  const flags = new Set(["--csv", "--episode"]);
  const args = Deno.args.filter((a) => !flags.has(a));
  const csv = Deno.args.includes("--csv");
  const episodeMode = Deno.args.includes("--episode");
  if (args.length === 0) {
    console.error("Usage: deno task analyze <url...> [--csv] [--episode]");
    Deno.exit(1);
  }

  await initTokenizer();

  const rows: AnalyzeResult[] = [];
  for (const [i, url] of args.entries()) {
    if (i > 0) await sleep(FETCH_INTERVAL_MS);
    try {
      const row = await analyzeWork(url, episodeMode);
      printDetail(row);
      rows.push(row);
    } catch (e) {
      console.error(`\n✗ ${url}\n  ${e instanceof Error ? e.message : e}`);
    }
  }

  if (rows.length > 1) printTable(rows);
  if (csv) printCsv(rows);
}

await main();
