// スコアリング式の研究ハーネス。ラベル付きデータ(.agents/runtime/labels.jsonl)と生指標データセットで、
// 重み・正規化・ペナルティ・緩和の仮説を一括比較し、元スコアとの差分を出す。再フェッチゼロ。
//
// 問い: 単一スコアのまま「良を上げつつゴミを抑える」設定はあるか（＝ゲートと表示の両立可能性）。
// Usage: deno task research
//
// 仮説の足し引きはこのファイルの HYPOTHESES を編集する（config デルタを書くだけ）。

import { loadDataset, loadLabels } from "./lib/dataset.ts";
import { scoreWithConfig } from "./lib/score_experiment.ts";
import {
  METRIC_CONFIGS,
  type MetricConfig,
  PENALTY_RULES,
  type PenaltyRule,
} from "../src/domain/scoring/weights.ts";

const THRESHOLD = 40;

// --- config デルタ・ヘルパ（production を複製して一部だけ差し替える）---
function weights(deltas: Record<string, number>): MetricConfig[] {
  return METRIC_CONFIGS.map((c) => (c.key in deltas ? { ...c, weight: deltas[c.key] } : c));
}
function normalize(key: string, fn: (raw: number) => number): MetricConfig[] {
  return METRIC_CONFIGS.map((c) => (c.key === key ? { ...c, normalize: fn } : c));
}
function penalty(label: string, patch: Partial<PenaltyRule>): PenaltyRule[] {
  return PENALTY_RULES.map((r) => (r.label === label ? { ...r, ...patch } : r));
}
function penaltyCond(label: string, key: string, threshold: number): PenaltyRule[] {
  return PENALTY_RULES.map((r) =>
    r.label === label
      ? {
        ...r,
        conditions: r.conditions.map((
          c,
        ) => (c.key === key ? { ...c, criticalThreshold: threshold } : c)),
      }
      : r
  );
}

interface Hypothesis {
  tag: string;
  metricConfigs: MetricConfig[];
  penaltyRules: PenaltyRule[];
  note: string;
}

const COMPOSITE = "一文一段落の過多";
const HYPOTHESES: Hypothesis[] = [
  { tag: "H0基準", metricConfigs: METRIC_CONFIGS, penaltyRules: PENALTY_RULES, note: "現行" },
  {
    tag: "H1_M1重み↓",
    metricConfigs: weights({ singleSentParaRatio: 0.20, sentenceLengthSD: 0.22 }),
    penaltyRules: PENALTY_RULES,
    note: "一文一段落の重み0.30→0.20、その0.10を文長SDへ移す",
  },
  {
    tag: "H2_M1正規化緩",
    metricConfigs: normalize("singleSentParaRatio", (r) => Math.min(r / 1.25, 1)),
    penaltyRules: PENALTY_RULES,
    note: "比率の減点を圧縮（min(ratio/1.25,1)）。正規化変更はペナルティ発火にも波及",
  },
  {
    tag: "H3_複合緩和",
    metricConfigs: METRIC_CONFIGS,
    penaltyRules: penalty(COMPOSITE, { penaltyMultiplier: 0.78 }),
    note: "一文一段落ペナルティ ×0.65→0.78",
  },
  {
    tag: "H4_複合SD閾↓",
    metricConfigs: METRIC_CONFIGS,
    penaltyRules: penaltyCond(COMPOSITE, "sentenceLengthSD", 0.52),
    note: "複合ペナ発火のSDゲート SD<15→SD<13（発火する作品を絞る）",
  },
  {
    tag: "H5_重み↓+緩和",
    metricConfigs: weights({ singleSentParaRatio: 0.20, sentenceLengthSD: 0.22 }),
    penaltyRules: penalty(COMPOSITE, { penaltyMultiplier: 0.78 }),
    note: "H1+H3",
  },
];

function pad(s: string, n: number): string {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0xff ? 2 : 1;
  return s + " ".repeat(Math.max(0, n - w));
}

async function main(): Promise<void> {
  const records = await loadDataset(".agents/runtime/dataset.jsonl");
  const labels = await loadLabels(".agents/runtime/labels.jsonl");
  if (records.length === 0) {
    console.error("データセットが空。先に deno task crawl");
    Deno.exit(1);
  }
  const labeled = records.filter((r) => labels.has(r.workId));
  const good = labeled.filter((r) => labels.get(r.workId) === "良");
  const trash = labeled.filter((r) => labels.get(r.workId) === "ゴミ");
  console.log(
    `データセット ${records.length}件 / ラベル付き ${labeled.length}件（良${good.length}・ゴミ${trash.length}・対象外${
      labeled.length - good.length - trash.length
    }）\n`,
  );

  // --- 仮説ごとのラベル別スコア（良は高く・ゴミは低く、が理想）---
  console.log("=== 仮説別: 良/ゴミの通過分離（gate 40）＋全体フリップ ===");
  console.log(
    pad("仮説", 16) + pad("良min", 7) + pad("良平均", 7) + pad("ゴミmax", 8) + pad("ゴミ平均", 8) +
      pad("gap", 6) + pad("通過数", 7) + "基準からのフリップ",
  );
  const baselineScore = new Map<string, number>();
  for (const r of records) {
    baselineScore.set(r.workId, scoreWithConfig(r.rawMetrics, METRIC_CONFIGS, PENALTY_RULES));
  }
  for (const h of HYPOTHESES) {
    const sc = (r: typeof records[number]) =>
      scoreWithConfig(r.rawMetrics, h.metricConfigs, h.penaltyRules);
    const gScores = good.map(sc), tScores = trash.map(sc);
    const gMin = Math.min(...gScores), gMean = gScores.reduce((a, b) => a + b, 0) / gScores.length;
    const tMax = Math.max(...tScores), tMean = tScores.reduce((a, b) => a + b, 0) / tScores.length;
    let flips = 0;
    for (const r of records) {
      const base = baselineScore.get(r.workId)! > THRESHOLD;
      const now = sc(r) > THRESHOLD;
      if (base !== now) flips++;
    }
    const passN = records.filter((r) => sc(r) > THRESHOLD).length;
    console.log(
      pad(h.tag, 16) + pad(gMin.toFixed(0), 7) + pad(gMean.toFixed(1), 7) +
        pad(tMax.toFixed(0), 8) +
        pad(tMean.toFixed(1), 8) + pad((gMin - tMax).toFixed(0), 6) + pad(String(passN), 7) +
        `${flips}件`,
    );
  }

  // --- ラベル付き作品の仮説別スコア（個票）---
  console.log("\n=== ラベル付き作品の個票（各仮説スコア）===");
  const header = pad("判定", 6) + pad("作品", 22) +
    HYPOTHESES.map((h) => pad(h.tag.replace(/^H\d_?/, ""), 9)).join("");
  console.log(header);
  for (
    const r of [
      ...good,
      ...trash,
      ...labeled.filter((r) => labels.get(r.workId) === "対象外"),
    ]
  ) {
    const cells = HYPOTHESES.map((h) =>
      pad(String(scoreWithConfig(r.rawMetrics, h.metricConfigs, h.penaltyRules)), 9)
    );
    console.log(pad(labels.get(r.workId)!, 6) + pad(r.title.slice(0, 20), 22) + cells.join(""));
  }

  console.log("\n仮説の説明:");
  for (const h of HYPOTHESES) console.log(`  ${pad(h.tag, 16)} ${h.note}`);
}

await main();
