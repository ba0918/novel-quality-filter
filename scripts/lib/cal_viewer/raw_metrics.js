// DetailPanel の「rawMetrics（全指標）」節向けヘルパ。work.rawMetrics は16項目を持つが、
// うち12項目はスコアリングに使われ MetricResult（work.canonical.metrics 等）が既に
// key/label/rawValue を持っている。ここでラベル文字列を複製すると weights.ts 側のラベル変更で
// ドリフトするため、スコア対象12項目は呼び出し側から渡された scoredMetrics のラベルをそのまま
// 使う。ラベルの登録先が存在しない残り4項目（総数・カウント系）だけをここで定義する。

import { formatInt, formatRawValue } from "./format.js";

// RawMetrics のうちスコアリングに使われない4項目（他の指標の分母などに折り込まれるだけで、
// それ自体は MetricResult化されないため label の登録先がどこにもない）。
export const RAW_ONLY_METRIC_LABELS = [
  ["charCount", "総文字数"],
  ["sentenceCount", "文数"],
  ["separatorCount", "区切り数"],
  ["dialogueCount", "会話文数"],
];

// rawMetrics の16項目全てを [key, label, 表示用文字列] の配列として返す。表示順は
// 「非スコア4項目 → スコア対象12項目（scoredMetrics の並び）」で固定する。
export function rawMetricsRows(rawMetrics, scoredMetrics) {
  const rawOnlyRows = RAW_ONLY_METRIC_LABELS.map(([key, label]) => [
    key,
    label,
    formatInt(rawMetrics[key]),
  ]);
  const scoredRows = scoredMetrics.map((m) => [m.key, m.label, formatRawValue(m.rawValue)]);
  return [...rawOnlyRows, ...scoredRows];
}

// ListTable の「平均文字数」列。rawMetrics 単体からは求まらない一文あたりの平均文字数
// （charCount / sentenceCount）を表示用に整形する。
export function averageCharCountLabel(rawMetrics) {
  if (rawMetrics.sentenceCount === 0) return "-";
  return (rawMetrics.charCount / rawMetrics.sentenceCount).toFixed(1);
}
