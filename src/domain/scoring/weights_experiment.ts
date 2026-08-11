// 較正ツール用の実験式。正本 weights.ts の型（MetricConfig / PenaltyRule）だけを共有し、
// 設定は独立した literal として持つ。正本の METRIC_CONFIGS / PENALTY_RULES は import 参照
// しない（値を再利用すると同じ配列を触ってしまい正本を汚す危険があるため、丸ごと複製する）。
//
// 運用方針: 初期状態は正本と完全同一の値（差分ゼロ）で始める。実験デルタを入れるときは、
// 事前に brainstorm で仮説と根拠を議論してから、その決定を反映する形でここを書き換える。
// weights_experiment_test.ts の「初期状態は差分ゼロ」テストが赤くなるので、デルタ導入時は
// テスト側の期待も同時に更新する（＝デルタ導入が可視化される）。
// 新しい評価軸を足すときも、正本には触れずこの配列へ追記する（拡張は追加で行う）。

import type { LineMetadata, RawMetrics } from "../types.ts";
import type { MetricConfig, PenaltyRule } from "./weights.ts";

// 正本と同じ閾値。丸ごと複製方針に沿って import せず、値だけ独立に持つ。
const SHORT14_NARRATIVE_RATIO_THRESHOLD = 0.30;

export const EXPERIMENT_METRIC_CONFIGS: MetricConfig[] = [
  {
    key: "singleSentParaRatio",
    label: "一文一段落比率",
    weight: 0.30,
    normalize: (raw: number) => Math.min(raw, 1),
    invert: true,
    flagThreshold: 0.4,
  },
  {
    key: "sentenceLengthSD",
    label: "文長の標準偏差",
    weight: 0.12,
    normalize: (raw: number) => Math.min(raw / 25, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    key: "separatorFrequency",
    label: "水平線/区切りの頻度",
    weight: 0.07,
    normalize: (raw: number) => Math.min(raw * 10, 1),
    invert: true,
    flagThreshold: 0.4,
  },
  {
    key: "dialogueEndingVariety",
    label: "会話語尾の多様性",
    weight: 0.08,
    normalize: (raw: number) => Math.min(raw, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    key: "ttr",
    label: "語彙多様性（TTR）",
    weight: 0.06,
    normalize: (raw: number) => Math.min(raw / 0.7, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    key: "descriptionDensitySD",
    label: "描写密度の分散",
    weight: 0.05,
    normalize: (raw: number) => Math.min(raw / 0.06, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    key: "paragraphLengthSD",
    label: "段落長の標準偏差",
    weight: 0.05,
    normalize: (raw: number) => Math.min(raw / 40, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    key: "taigendomeEntropy",
    label: "体言止め分布の均一性",
    weight: 0.02,
    normalize: (raw: number) => raw === 0 ? 0.5 : Math.min(raw / 2, 1),
    invert: true,
    flagThreshold: 0.4,
  },
  {
    key: "emotionDirectnessRatio",
    label: "感情直接表現率",
    weight: 0.07,
    normalize: (raw: number) => Math.min(raw / 0.08, 1),
    invert: true,
    flagThreshold: 0.4,
  },
  {
    key: "logicalConnectiveDensity",
    label: "論理接続詞密度",
    weight: 0.06,
    normalize: (raw: number) => Math.min(raw / 0.3, 1),
    invert: true,
    flagThreshold: 0.4,
  },
  {
    key: "paragraphTransitionEntropy",
    label: "段落遷移エントロピー",
    weight: 0.04,
    normalize: (raw: number) => Math.min(raw / 1.5, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    key: "sentenceLengthBurstiness",
    label: "文長バースティネス",
    weight: 0.08,
    normalize: (raw: number) => Math.min(raw / 8, 1),
    invert: false,
    flagThreshold: 0.5,
  },
];

export const EXPERIMENT_PENALTY_RULES: PenaltyRule[] = [
  {
    label: "文長の緩急・ばらつき不足",
    conditions: [
      { key: "sentenceLengthBurstiness", criticalThreshold: 0.5, exemptWhenZero: true },
      { key: "sentenceLengthSD", criticalThreshold: 0.45 },
    ],
    penaltyMultiplier: 0.55,
  },
  {
    // 一文一段落が多くても、文の長短が豊かなら紋切りではない（人気長編に多い）。
    // 文長のばらつきが小さい（単調な）ときに限って紋切り型として減点する。
    label: "一文一段落の過多",
    conditions: [
      { key: "singleSentParaRatio", criticalThreshold: 0.30 },
      { key: "sentenceLengthSD", criticalThreshold: 0.60 },
    ],
    penaltyMultiplier: 0.75,
  },
  {
    // 地の文の 14 字未満短行率が 30% を超える帯を減点する。lineMetadata が無い、または
    // 地の文が 0 行なら測定不能として適用外にする（0 割回避）。
    label: "地の文短行14 の過多",
    conditions: [],
    penaltyMultiplier: 0.85,
    evaluate: (_raw: RawMetrics, lineMetadata?: LineMetadata) => {
      if (!lineMetadata) return false;
      const narrative = lineMetadata.narrative;
      if (narrative.lineCount === 0) return false;
      const ratio = narrative.short14 / narrative.lineCount;
      return ratio > SHORT14_NARRATIVE_RATIO_THRESHOLD;
    },
  },
];
