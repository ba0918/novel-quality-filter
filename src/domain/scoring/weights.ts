import type { LineMetadata, RawMetrics } from "../types.ts";

export interface MetricConfig {
  key: string;
  label: string;
  weight: number;
  normalize: (raw: number) => number;
  invert: boolean;
  flagThreshold: number;
}

export const METRIC_CONFIGS: MetricConfig[] = [
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

export interface PenaltyCondition {
  key: string;
  criticalThreshold: number;
  exemptWhenZero?: boolean;
}

// PenaltyRule は 2 系統ある。
// - conditions ベース: 既存 rule。RawMetrics の正規化値だけで発火判定する
// - evaluate ベース: 新 rule。RawMetrics に加えて lineMetadata の派生値（短行率など）を参照する
// どちらか一方を使う設計とし、conditions + evaluate 併用は想定しない（judgement path が 1 本になる）。
// evaluate 定義時は calculateScore がその関数だけを呼ぶ。conditions は無視する（空配列で表現）。
export interface PenaltyRule {
  label: string;
  conditions: PenaltyCondition[];
  penaltyMultiplier: number;
  evaluate?: (rawMetrics: RawMetrics, lineMetadata?: LineMetadata) => boolean;
}

// 地の文短行14 率の閾値。strict `>` で判定する（境界 30% は非発火）。
const SHORT14_NARRATIVE_RATIO_THRESHOLD = 0.30;

export const PENALTY_RULES: PenaltyRule[] = [
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
    // n=24 較正で駄 8/10 が発火 → 「強すぎる」観測。0.65 から 0.75 に緩和し、
    // 「地の文短行14 の過多」と併用することで良巻き込みリスクを分散する。
    label: "一文一段落の過多",
    conditions: [
      { key: "singleSentParaRatio", criticalThreshold: 0.30 },
      { key: "sentenceLengthSD", criticalThreshold: 0.60 },
    ],
    penaltyMultiplier: 0.75,
  },
  {
    // 地の文の 14 字未満短行率が 30% を超える作品を「1 行の情報量が薄い」帯として減点する。
    // 較正で駄側に集中して観測される帯（n=24）。lineMetadata が無い、または地の文が 0 行なら
    // 測定不能として適用外にする（0 割回避 & 「短行なし」との混同回避）。
    label: "地の文短行14 の過多",
    conditions: [],
    penaltyMultiplier: 0.85,
    evaluate: (_raw, lineMetadata) => {
      if (!lineMetadata) return false;
      const narrative = lineMetadata.narrative;
      if (narrative.lineCount === 0) return false;
      const ratio = narrative.short14 / narrative.lineCount;
      return ratio > SHORT14_NARRATIVE_RATIO_THRESHOLD;
    },
  },
];

export const DEFAULT_THRESHOLD = 40;

// 表示スコア較正カーブの制御点（集約段の 13 本目の normalize）。
// PCHIP 単調保持補間で `base_score * penalty_multiplier` を表示スコアに写す。
// 契約: 単調性 / f(40)=40 / C1 連続 / pass-fail 集合不変（calibration_test.ts で固定）。
// 初期値は moderate 系（良側の押し上げと分布連続性のバランス）。cal_viewer で目視選定し
// docs/spec/scoring.md「表示較正カーブ」節で議論した値。制御点変更は spec 更新と
// brainstorm 経由の合意を必須とする（勝手にいじると駄側の誤透過リスクが顕在化する）。
export const CALIBRATION_CONTROL_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [40, 40],
  [50, 52],
  [60, 65],
  [75, 80],
  [100, 100],
];
