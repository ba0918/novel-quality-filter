import type { LineMetadata, RawMetrics } from "../types.ts";

export interface MetricConfig {
  key: string;
  label: string;
  weight: number;
  normalize: (raw: number) => number;
  invert: boolean;
  flagThreshold: number;
  // 派生指標の生値取得関数。RawMetrics のキー参照では取れない指標
  // (例: lineMetadata 依存の派生値) を weight 化するときに使う。
  // 定義済みなら raw[key] の代わりにこの関数の返り値を rawValue として使う。
  // canonical (weights.ts の METRIC_CONFIGS) では未使用。実験式 (weights_experiment.ts)
  // で narrativeShort14Ratio 等を実験的に weight 化するときに指定する。
  deriveRawValue?: (raw: RawMetrics, lineMetadata?: LineMetadata) => number;
}

// 12 指標構造整地 (rev 20260811224443、cycle plan/20260811223047_family0-narrative-layer.md
// および parent plan/20260811223047_12-metrics-integrity-refactor.md 参照)。
// n=25 良/駄ラベル + n=130 dataset の実測駆動改修で以下の構造変更を反映:
// - 4 指標を weight 0 化 (実測で判別ゼロ or 交絡・バイアス確定): descriptionDensitySD,
//   separatorFrequency, dialogueEndingVariety, ttr。エントリは残す (削除で型変更 or
//   backfill 前データ壊れる懸念、weight 0 で寄与ゼロ)
// - 削減 weight 合計 0.26 を判別 4 指標に按分: sentenceLengthSD 0.12→0.22、
//   paragraphLengthSD 0.05→0.09、paragraphTransitionEntropy 0.04→0.08、
//   sentenceLengthBurstiness 0.08→0.16。base 合計 1.0 維持
// - PENALTY_RULES: 短行14 penalty multiplier 0.85 → 0.80 (家族 0 で narrative シグナル強化)
// - narrativeShort14Ratio の weight 化は家族 0 実測で駄側境界作品を押し上げるため見送り
// - emotion / logical 辞書純化は本文再解析要で別 cycle に持ち越し
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
    weight: 0.22,
    normalize: (raw: number) => Math.min(raw / 25, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    // rev 20260811224443: 実測分布 median/Q1/Q3=0.000 の死指標のため weight 0 化。
    key: "separatorFrequency",
    label: "水平線/区切りの頻度",
    weight: 0,
    normalize: (raw: number) => Math.min(raw * 10, 1),
    invert: true,
    flagThreshold: 0.4,
  },
  {
    // rev 20260811224443: 実測 d=+0.088 の死指標 + 会話数バイアス r=-0.669 で weight 0 化。
    key: "dialogueEndingVariety",
    label: "会話語尾の多様性",
    weight: 0,
    normalize: (raw: number) => Math.min(raw, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    // rev 20260811224443: charCount 交絡 r=-0.815 で weight 0 化 (n=25 で正規化設計不能)。
    key: "ttr",
    label: "語彙多様性（TTR）",
    weight: 0,
    normalize: (raw: number) => Math.min(raw / 0.7, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    // rev 20260811224443: 段落数バイアス r=+0.391 で weight 0 化 (singleSentParaRatio と冗長)。
    key: "descriptionDensitySD",
    label: "描写密度の分散",
    weight: 0,
    normalize: (raw: number) => Math.min(raw / 0.06, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    key: "paragraphLengthSD",
    label: "段落長の標準偏差",
    weight: 0.09,
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
    // rev 20260811224443: 辞書純化は次 cycle で本文再解析経由で実測予定。この rev では
    // canonical の weight/normalize/invert は現行のまま維持。
    key: "emotionDirectnessRatio",
    label: "感情直接表現率",
    weight: 0.07,
    normalize: (raw: number) => Math.min(raw / 0.08, 1),
    invert: true,
    flagThreshold: 0.4,
  },
  {
    // rev 20260811224443: 辞書純化は次 cycle で本文再解析経由で実測予定。この rev では
    // canonical の weight/normalize/invert は現行のまま維持。
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
    weight: 0.08,
    normalize: (raw: number) => Math.min(raw / 1.5, 1),
    invert: false,
    flagThreshold: 0.3,
  },
  {
    key: "sentenceLengthBurstiness",
    label: "文長バースティネス",
    weight: 0.16,
    normalize: (raw: number) => Math.min(raw / 8, 1),
    invert: false,
    flagThreshold: 0.5,
  },
  {
    // 候補 D (rev 20260812190006): n=25 の Feature Importance 単独 1 位 (RF 0.120) を weight 化。
    // holdout (新規 13 ラベル) でも良側保存を確認済み (experiments/20260812-holdout/results.md)。
    // 既存 weight の按分はしない (按分は既存指標の「1 単位の意味」を変える)。合計 1.15 は
    // calculateScore 側で Σweight rescale して 100 満点に戻す (Flesch 等の古典的手法と同じ流儀)。
    key: "narrativeCharPerLine",
    label: "地の文の平均字/行",
    weight: 0.15,
    normalize: (raw: number) => Math.min(raw / 25, 1),
    invert: false,
    flagThreshold: 0.3,
    deriveRawValue: (_raw, lineMetadata) => {
      const narrative = lineMetadata?.narrative;
      if (!narrative || narrative.lineCount === 0) return 0;
      return narrative.charCount / narrative.lineCount;
    },
  },
];

export interface PenaltyCondition {
  key: string;
  criticalThreshold: number;
  exemptWhenZero?: boolean;
}

// PenaltyRule は 3 系統ある。いずれか一方だけを使う排他設計 (judgement path が 1 本になる)。
// - conditions ベース: 既存 rule。RawMetrics の正規化値だけで発火判定する
// - evaluate ベース: RawMetrics に加えて lineMetadata の派生値（短行率など）を参照し on/off 判定する
// - grader ベース: on/off ではなく連続値の multiplier を返す (1.0 = 非発火)。閾値の僅超過と
//   極端値を同じ強さで殴らないための系統 (候補 D の短行14 grade 化で導入)
// grader 定義時は calculateScore がその関数だけを呼び、penaltyMultiplier / conditions は無視する。
export interface PenaltyRule {
  label: string;
  conditions: PenaltyCondition[];
  penaltyMultiplier: number;
  evaluate?: (rawMetrics: RawMetrics, lineMetadata?: LineMetadata) => boolean;
  graderMultiplier?: (rawMetrics: RawMetrics, lineMetadata?: LineMetadata) => number;
}

// 地の文短行14 率の閾値。strict `>` で判定する（境界 30% は非発火）。
const SHORT14_NARRATIVE_RATIO_THRESHOLD = 0.30;

// 案 A (rev 20260812、cycle plan は本コミットの pack 参照): 発火した rule 群の multiplier を
// 「乗算合成」から「min-mult 合成 (最も強い 1 個だけ適用)」に切り替える。
// 動機: n=25 (良15/駄10) 実測で境界作品の誤 drop 主犯が二重発火時の乗算合成と判明。
//   例: 良「スキルレベル」base 56.7 が 0.75×0.80=0.60 で 34.0 に潰れた (min-mult なら 42.5)。
// 単発発火時は乗算/最小どちらも同値なので、既存駄側の判別 (10/10 drop) は温存見込み。
// 判定パック (Fable 5) が案 A 単独 → 実測ゲート → 案 E の 2 段階を承認。ゲート:
//   駄 drop=10/10 維持 / AUC ≥ 0.933 近傍 / 良 keep ≥ 12/15。
export function combinePenaltyMultipliers(multipliers: number[]): number {
  if (multipliers.length === 0) return 1.0;
  let m = multipliers[0];
  for (let i = 1; i < multipliers.length; i++) {
    if (multipliers[i] < m) m = multipliers[i];
  }
  return m;
}

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
    // n=24 較正で駄 8/10 が発火 → 「強すぎる」観測で 0.65 → 0.75。
    // 候補 D (rev 20260812190006): 良側 (sspr>0.3 & SD<15 帯の良作) への発火が実測で
    // 残っていたため 0.75 → 0.85 にさらに緩和。代償の駄側透過は holdout 検証込みで受容
    // (experiments/20260812-holdout/results.md)。
    label: "一文一段落の過多",
    conditions: [
      { key: "singleSentParaRatio", criticalThreshold: 0.30 },
      { key: "sentenceLengthSD", criticalThreshold: 0.60 },
    ],
    penaltyMultiplier: 0.85,
  },
  {
    // 地の文の 14 字未満短行率が 30% を超える作品を「1 行の情報量が薄い」帯として減点する。
    // 較正で駄側に集中して観測される帯（n=24）。lineMetadata が無い、または地の文が 0 行なら
    // 測定不能として適用外にする（0 割回避 & 「短行なし」との混同回避）。
    // 候補 D (rev 20260812190006): on/off (×0.80 一律) を grade 化。31% と 79% を同じ強さで
    // 殴る段差が良側境界作品 (s14=42% の良作など) の巻き込み主因だったため、比率に比例する
    // 連続 multiplier `max(0.55, 1 - (ratio - 0.30))` に置き換える。50% で旧 on/off 相当の
    // 0.80、floor 0.55 で極端値の下げ止まりを固定する。
    label: "地の文短行14 の過多",
    conditions: [],
    penaltyMultiplier: 0.80, // grader 定義時は未使用 (後方参照用に旧値を残す)
    graderMultiplier: (_raw, lineMetadata) => {
      const narrative = lineMetadata?.narrative;
      if (!narrative || narrative.lineCount === 0) return 1.0;
      const ratio = narrative.short14 / narrative.lineCount;
      if (ratio <= SHORT14_NARRATIVE_RATIO_THRESHOLD) return 1.0;
      return Math.max(0.55, 1 - (ratio - SHORT14_NARRATIVE_RATIO_THRESHOLD));
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
