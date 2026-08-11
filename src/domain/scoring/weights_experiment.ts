// 較正ツール用の実験式。正本 weights.ts の型（MetricConfig / PenaltyRule）だけを共有し、
// 設定は独立した literal として持つ。正本の METRIC_CONFIGS / PENALTY_RULES は import 参照
// しない（値を再利用すると同じ配列を触ってしまい正本を汚す危険があるため、丸ごと複製する）。
//
// 運用方針: 家族 0 デルタ (20260811224443) を 3 回の実測で調整した結果 (Fable A4 相当)。
// - 1 回目 (A2): narrativeShort14Ratio weight 0.08 + 短行14 penalty 廃止 + 一文一段落
//   multiplier 0.70 → 駄側 2 件 pass 化で gate FAIL
// - 2 回目 (A3): + 短行14 penalty 復活 (multiplier 0.85) → 駄側 1 件 pass 化で gate FAIL
// - 3 回目 (A4 相当): narrativeShort14Ratio weight 0 に + 短行14 penalty 強化 (0.85 → 0.70)
//   → narrativeShort14Ratio weight 化を諦め、判別力は penalty 側 multiplier で活用
// - dialogueEndingVariety は canonical と同値 0.08 を維持 (家族 2 で正式廃止予定)
// - 「一文一段落の過多」multiplier は canonical と同値 0.75 を維持
// - narrativeShort14Ratio エントリ自体は weight 0 で残す (統合 Step で normalize 分位点
//   アンカーを実測分位点で再設計する余地を残す。一気に削除しない)
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
    // 家族 0 デルタ 3 回目 (Fable A4 相当): dialogueEndingVariety は canonical と同値
    // (weight 0.08) を維持。narrativeShort14Ratio weight 化を諦めたため weight 移動不要。
    // 家族 2 で正式に廃止判断予定。
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
  {
    // 家族 0 デルタ 3 回目 (Fable A4 相当): narrativeShort14Ratio の weight を 0.08 → 0 に
    // 落とす (エントリは残す = deriveRawValue で lineMetadata が渡らない環境でも壊れない)。
    // 1-2 回目 (A2/A3) では駄側の境界作品を良側寄与で押し上げてしまい gate FAIL。
    // 家族 0 の主目的を「narrativeShort14Ratio 主役化」から「短行14 penalty 強化」に転換。
    // 短行14 の判別力は penalty 側の multiplier 強化 (0.85 → 0.70) で使う。
    key: "narrativeShort14Ratio",
    label: "地の文短行14 の比率",
    weight: 0,
    normalize: (raw: number) => Math.min(raw / 0.3, 1),
    invert: true,
    flagThreshold: 0.4,
    deriveRawValue: deriveNarrativeShort14Ratio,
  },
];

// 家族 0 デルタ 2 回目の調整: 短行14 penalty 削除 (A2) では駄側 2 件が pass 化して gate FAIL。
// Fable の理論却下 A3 (narrativeShort14Ratio weight + short14 penalty 両方残す) を実測で検証する
// (「推測するな計測せよ」原則)。良は short14 が低いので両方の減点が発火しにくく影響小、駄は両方
// 発火して駄側減点を強化する構造。二重計上の懸念は実測結果 (良の透過数と駄の遮断数の両立) で判定。
const SHORT14_NARRATIVE_RATIO_THRESHOLD = 0.30;

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
    // 家族 0 デルタ: canonical と同値 0.75 を維持 (1 回目 0.70 で駄 2 件 pass 化のため戻した)。
    label: "一文一段落の過多",
    conditions: [
      { key: "singleSentParaRatio", criticalThreshold: 0.30 },
      { key: "sentenceLengthSD", criticalThreshold: 0.60 },
    ],
    penaltyMultiplier: 0.75,
  },
  {
    // 家族 0 デルタ 4 回目: 短行14 penalty multiplier を 0.80 に微強化 (0.85 と 0.70 の中間)。
    // 3 回目 (0.70) では良側 1 件を巻き込んで gate FAIL。0.80 で良/駄の中庸を探る。
    label: "地の文短行14 の過多",
    conditions: [],
    penaltyMultiplier: 0.80,
    evaluate: (_raw: RawMetrics, lineMetadata?: LineMetadata) => {
      if (!lineMetadata) return false;
      const narrative = lineMetadata.narrative;
      if (narrative.lineCount === 0) return false;
      const ratio = narrative.short14 / narrative.lineCount;
      return ratio > SHORT14_NARRATIVE_RATIO_THRESHOLD;
    },
  },
];
