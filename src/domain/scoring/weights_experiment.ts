// 較正ツール用の実験式。正本 weights.ts の型（MetricConfig / PenaltyRule）だけを共有し、
// 設定は独立した literal として持つ。正本の METRIC_CONFIGS / PENALTY_RULES は import 参照
// しない（値を再利用すると同じ配列を触ってしまい正本を汚す危険があるため、丸ごと複製する）。
//
// 運用方針: 家族 0 デルタ (20260811224443) を導入。
// - narrativeShort14Ratio (地の文の 14 字未満短行の比率) を新規 weight 化 (invert=true,
//   weight 0.08)。生値は lineMetadata から派生 (deriveRawValue で narrative.short14 /
//   narrative.lineCount, lineCount=0 で中立値 0.5)。実測 d=-1.728 で全指標中 |d| 最大
// - dialogueEndingVariety の weight を 0.08 → 0 に (実測 d=+0.088 の死指標、家族 2 で
//   正式廃止予定。家族 0 の実測時点で weight 合計 1.0 を維持するため先に 0 化)
// - PENALTY_RULES から「地の文短行14 の過多」を削除 (narrativeShort14Ratio と同一シグナル
//   の二重計上回避、Fable 裁定 A2)
// - 「一文一段落の過多」multiplier を 0.75 → 0.70 に (短行14 penalty 廃止で「良巻き込み
//   リスク分散」の緩和根拠が失効、Fable 見落とし指摘 1)
//
// weights_experiment_test.ts の差分アサーションを同時に更新した (デルタ導入が可視化される)。
// 詳細は plan `.agents/artifacts/plans/20260811224443_family0-narrative-layer.md` 参照。

import type { LineMetadata, RawMetrics } from "../types.ts";
import type { MetricConfig, PenaltyRule } from "./weights.ts";

// narrativeShort14Ratio の派生関数。lineMetadata があれば narrative.short14 / narrative.lineCount。
// lineCount === 0 (地の文なし) は測定不能で中立値 0.5 を返す。taigendomeEntropy の中立値 0.5
// と同じ思想 (契約 4 保護: エッジ作品の pass-fail を変えない)。lineMetadata 未指定は 0.5。
function deriveNarrativeShort14Ratio(
  _raw: RawMetrics,
  lineMetadata?: LineMetadata,
): number {
  if (!lineMetadata) return 0.5;
  const narrative = lineMetadata.narrative;
  if (narrative.lineCount === 0) return 0.5;
  return narrative.short14 / narrative.lineCount;
}

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
    // 家族 0 デルタ: 実測 d=+0.088 の死指標。weight を 0.08 → 0 に。キー自体は残す
    // (正本と同じキー集合を持つテスト契約のため)。家族 2 で正式に廃止判断予定。
    key: "dialogueEndingVariety",
    label: "会話語尾の多様性",
    weight: 0,
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
  {
    // 家族 0 デルタ: narrativeShort14Ratio を新規 weight 化。生値は lineMetadata から派生。
    // dialogueEndingVariety の weight 0.08 を移動 (weight 合計 1.0 維持)。normalize は暫定
    // (median 相当 0.3 を分母)。実測後の統合 Step で分位点アンカーを再設定予定。
    key: "narrativeShort14Ratio",
    label: "地の文短行14 の比率",
    weight: 0.08,
    normalize: (raw: number) => Math.min(raw / 0.3, 1),
    invert: true,
    flagThreshold: 0.4,
    deriveRawValue: deriveNarrativeShort14Ratio,
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
    // 家族 0 デルタ: multiplier を 0.75 → 0.70 に。短行14 penalty 廃止で「良巻き込みリスク
    // 分散」の緩和根拠が失効したため対で見直し。
    label: "一文一段落の過多",
    conditions: [
      { key: "singleSentParaRatio", criticalThreshold: 0.30 },
      { key: "sentenceLengthSD", criticalThreshold: 0.60 },
    ],
    penaltyMultiplier: 0.70,
  },
  // 家族 0 デルタ: 「地の文短行14 の過多」penalty (multiplier 0.85) を削除。
  // narrativeShort14Ratio と同一シグナル (連続値 vs 閾値超過率) の二重計上を回避
  // (Fable 裁定 A2: judgement path を 1 本に保つ)。
];
