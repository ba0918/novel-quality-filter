// 既存 dataset.jsonl の全レコードを pages/ から rederive し直し、lineMetadata に
// short14 / shortChunk14 を含めた形で再生成する。既存の身元情報（title / url / tags /
// crawledAt / captureId 等）は原本レコードから引き継ぎ、再計算するのは rederive 由来の
// 数値（rawMetrics / lineMetadata / score / bodyHash / openingType 等）だけ。
//
// 安全策:
//   1. 出力先は別名（.jsonl.new）に書き、既存を上書きしない
//   2. rawMetrics の差分を必ず検算し、想定外の差分があれば警告
//   3. captureId が無いレコード（旧形式）はそのまま保留リストに出す
//
// 使い方: deno run --allow-read --allow-write scripts/backfill_line_metadata.ts

import { analyzeAll } from "../src/domain/analyzer/mod.ts";
import { initTokenizer, tokenize } from "../src/domain/tokenizer/mod.ts";
import { calculateScore } from "../src/domain/scoring/mod.ts";
import { analyzeBlankLineRatio } from "../src/domain/analyzer/blank_line.ts";
import { captureDir, loadCapture } from "./lib/capture_store.ts";
import { type DatasetRecord, loadDataset, toJsonl } from "./lib/dataset.ts";
import { rederive } from "./lib/rederive.ts";

const DATASET_PATH = ".agents/runtime/dataset.jsonl";
const PAGES_BASE_DIR = ".agents/runtime";
const OUTPUT_PATH = `${DATASET_PATH}.new`;

interface DiffReport {
  workId: string;
  rawMetricsDiff: string[];
  scoreDiff?: { old: number; new: number };
  bodyHashDiff?: { old: string; new: string };
}

async function main() {
  await initTokenizer();
  const compute = (text: string) => analyzeAll(text, tokenize(text), tokenize);

  const records = await loadDataset(DATASET_PATH);
  console.log(`[backfill] ${records.length} records loaded from ${DATASET_PATH}`);

  const skipped: DatasetRecord[] = [];
  const rebuilt: DatasetRecord[] = [];
  const diffs: DiffReport[] = [];

  for (const rec of records) {
    if (!rec.captureId || !rec.siteWorkId) {
      // 旧形式（captureId が無い）はそのまま残す
      skipped.push(rec);
      continue;
    }
    const [site, workId] = rec.siteWorkId.split(":");
    const dir = captureDir(PAGES_BASE_DIR, site, workId, rec.captureId);
    let capture;
    try {
      capture = await loadCapture(dir);
    } catch (e) {
      console.warn(`[skip] ${rec.workId}: capture 読み込み失敗 ${(e as Error).message}`);
      skipped.push(rec);
      continue;
    }
    const red = await rederive(capture, compute);

    // 差分検算: rawMetrics / bodyHash / score のいずれかが変化していれば警告
    const diff: DiffReport = { workId: rec.workId, rawMetricsDiff: [] };
    for (const key of Object.keys(red.rawMetrics) as Array<keyof typeof red.rawMetrics>) {
      const before = rec.rawMetrics[key];
      const after = red.rawMetrics[key];
      if (before !== after) diff.rawMetricsDiff.push(`${key}: ${before} → ${after}`);
    }
    // 「地の文短行14 の過多」ペナルティを新式に反映させるため、rederive で得た lineMetadata を
    // calculateScore に渡す。undefined を渡す旧経路と結果が変わる作品は score 差分として現れる。
    const newScore = calculateScore(red.rawMetrics, red.lineMetadata).score;
    if (newScore !== rec.score) diff.scoreDiff = { old: rec.score, new: newScore };
    if (red.bodyHash !== rec.bodyHash) {
      diff.bodyHashDiff = { old: rec.bodyHash ?? "(none)", new: red.bodyHash };
    }
    if (diff.rawMetricsDiff.length || diff.scoreDiff || diff.bodyHashDiff) diffs.push(diff);

    // 再構築レコード。身元情報は原本、rederive 由来だけ差し替える。
    const next: DatasetRecord = {
      ...rec,
      openingType: red.openingType,
      sampledCount: red.sampledCount,
      episodeUrl: capture.pages[red.targetEpisodeIndex].entry.url,
      score: newScore,
      rawMetrics: red.rawMetrics,
      blankLineRatio: analyzeBlankLineRatio(red.targetText),
      lineMetadata: red.lineMetadata,
      bodyHash: red.bodyHash,
    };
    rebuilt.push(next);
  }

  // 書き出し
  const out = [...rebuilt, ...skipped].map(toJsonl).join("");
  await Deno.writeTextFile(OUTPUT_PATH, out);

  // レポート
  console.log(`[backfill] rebuilt: ${rebuilt.length} / skipped: ${skipped.length}`);
  console.log(`[backfill] rebuilt records で差分ありは ${diffs.length} 件`);
  if (diffs.length) {
    console.log("[backfill] --- diff detail ---");
    for (const d of diffs) {
      console.log(`  * ${d.workId}`);
      for (const line of d.rawMetricsDiff) console.log(`      raw: ${line}`);
      if (d.scoreDiff) console.log(`      score: ${d.scoreDiff.old} → ${d.scoreDiff.new}`);
      if (d.bodyHashDiff) {
        console.log(
          `      hash: ${d.bodyHashDiff.old.slice(0, 8)} → ${d.bodyHashDiff.new.slice(0, 8)}`,
        );
      }
    }
  }
  console.log(`[backfill] wrote ${OUTPUT_PATH}. review with:`);
  console.log(`  diff <(jq -c . ${DATASET_PATH}) <(jq -c . ${OUTPUT_PATH}) | head -50`);
  console.log(`  # 問題なければ: mv ${OUTPUT_PATH} ${DATASET_PATH}`);
}

if (import.meta.main) await main();
