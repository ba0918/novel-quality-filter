// 較正データセット(JSONL)の実験ハーネス。生指標から任意設定でスコアを再計算し、
// 分布・象限（FP容疑/FN予備軍）・floor 掃引での閾値フリップを出す。再フェッチは一切しない。
//
// Usage: deno task exp [--in PATH]   （既定 .agents/runtime/dataset.jsonl）

import { loadDataset } from "./lib/dataset.ts";
import { type ExperimentConfig, scoreExperiment } from "./lib/score_experiment.ts";

const THRESHOLD = 40;

function argValue(flag: string, fallback: string): string {
  const i = Deno.args.indexOf(flag);
  return i >= 0 && i + 1 < Deno.args.length ? Deno.args[i + 1] : fallback;
}

function histogram(scores: number[]): string {
  const bins = [0, 20, 30, 40, 50, 60, 70, 101];
  const labels = ["0-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"];
  const counts = labels.map(() => 0);
  for (const s of scores) {
    for (let b = 0; b < labels.length; b++) {
      if (s >= bins[b] && s < bins[b + 1]) {
        counts[b]++;
        break;
      }
    }
  }
  return labels.map((l, i) => `  ${l.padEnd(6)} ${"█".repeat(counts[i])} ${counts[i]}`).join("\n");
}

async function main(): Promise<void> {
  const path = argValue("--in", ".agents/runtime/dataset.jsonl");
  const records = await loadDataset(path);
  if (records.length === 0) {
    console.error(`データセットが空: ${path}（先に deno task crawl）`);
    Deno.exit(1);
  }
  console.log(`データセット: ${records.length}件 (${path})\n`);

  // --- baseline 忠実性（保存スコア == 再計算スコア）---
  let mismatch = 0;
  for (const r of records) {
    if (scoreExperiment(r.rawMetrics, {}) !== r.score) mismatch++;
  }
  console.log(
    `baseline 再計算 == 保存スコア: ${mismatch === 0 ? "PASS" : `FAIL(${mismatch}件不一致)`}\n`,
  );

  // --- スコア分布（現行）---
  console.log("=== スコア分布（現行）===");
  console.log(histogram(records.map((r) => r.score)));
  const passN = records.filter((r) => r.score >= THRESHOLD).length;
  console.log(`  通過 ${passN} / 除外 ${records.length - passN}\n`);

  // --- 象限 ---
  const fpSuspect = records.filter((r) =>
    r.score >= THRESHOLD && r.rawMetrics.singleSentParaRatio > 0.70 &&
    r.rawMetrics.sentenceLengthSD >= 15
  );
  const fnCanary = records.filter((r) =>
    r.score < THRESHOLD && r.rawMetrics.singleSentParaRatio > 0.70 &&
    r.rawMetrics.sentenceLengthSD >= 13 && r.rawMetrics.sentenceLengthSD < 15
  );
  console.log(
    `=== FP容疑（通過 AND 比率>0.70 AND SD>=15。要人手ラベル）: ${fpSuspect.length}件 ===`,
  );
  for (const r of fpSuspect) {
    console.log(
      `  [${r.tags[0]}] ${r.score} 比率${r.rawMetrics.singleSentParaRatio.toFixed(2)}/SD${
        r.rawMetrics.sentenceLengthSD.toFixed(1)
      } ${r.title}\n    ${r.url}`,
    );
  }
  console.log(
    `\n=== FN予備軍（除外 AND 比率>0.70 AND SD13〜15。崩界クラス）: ${fnCanary.length}件 ===`,
  );
  for (const r of fnCanary) {
    console.log(
      `  [${r.tags[0]}] ${r.score} 比率${r.rawMetrics.singleSentParaRatio.toFixed(2)}/SD${
        r.rawMetrics.sentenceLengthSD.toFixed(1)
      } ${r.title}\n    ${r.url}`,
    );
  }

  // --- floor 掃引: 現行除外→通過に転じる作品（floorが新たに通す＝要ゴミ判定）---
  console.log("\n=== M1 floor 掃引（除外→通過に転じる作品数。中身は要人手判定）===");
  const floors = [0.25, 0.30, 0.35, 0.40];
  for (const f of floors) {
    const cfg: ExperimentConfig = { m1ContribFloor: f };
    const flips = records.filter((r) =>
      r.score < THRESHOLD && scoreExperiment(r.rawMetrics, cfg) >= THRESHOLD
    );
    console.log(`  floor=${f.toFixed(2)}: 新規通過 ${flips.length}件`);
    for (const r of flips) {
      console.log(
        `      ${r.score}→${scoreExperiment(r.rawMetrics, cfg)} 比率${
          r.rawMetrics.singleSentParaRatio.toFixed(2)
        }/SD${r.rawMetrics.sentenceLengthSD.toFixed(1)} ${r.title.slice(0, 24)}`,
      );
    }
  }
}

await main();
