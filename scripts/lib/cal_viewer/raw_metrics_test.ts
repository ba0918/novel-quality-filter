// raw_metrics.js の DetailPanel 向けヘルパを検証する。app.js は Preact/htm を esm.sh から
// import しており Deno test から直接 import するとネットワークに依存してしまうため、
// rawMetrics 全16項目の並び・ラベル・整形を Preact 非依存のこのモジュールへ切り出して
// テストする（app.js 側はこのモジュールをそのまま呼ぶだけ）。

import { assertEquals } from "@std/assert";
import { averageCharCountLabel, rawMetricsRows } from "./raw_metrics.js";

const RAW_METRICS = {
  charCount: 3000,
  sentenceCount: 60,
  sentenceLengthSD: 12,
  singleSentParaRatio: 0.85,
  paragraphLengthSD: 20,
  separatorCount: 2,
  separatorFrequency: 0.03,
  ttr: 0.5,
  dialogueCount: 20,
  dialogueEndingVariety: 0.5,
  descriptionDensitySD: 0.03,
  taigendomeEntropy: 1,
  emotionDirectnessRatio: 0.04,
  logicalConnectiveDensity: 0.1,
  paragraphTransitionEntropy: 1,
  sentenceLengthBurstiness: 5,
};

// cal.json の work.canonical.metrics 相当。key/label/rawValue のみ本テストで使う。
const SCORED_METRICS = [
  { key: "singleSentParaRatio", label: "一文一段落比率", rawValue: 0.85 },
  { key: "sentenceLengthSD", label: "文長の標準偏差", rawValue: 12 },
  { key: "separatorFrequency", label: "水平線/区切りの頻度", rawValue: 0.03 },
  { key: "dialogueEndingVariety", label: "会話語尾の多様性", rawValue: 0.5 },
  { key: "ttr", label: "語彙多様性（TTR）", rawValue: 0.5 },
  { key: "descriptionDensitySD", label: "描写密度の分散", rawValue: 0.03 },
  { key: "paragraphLengthSD", label: "段落長の標準偏差", rawValue: 20 },
  { key: "taigendomeEntropy", label: "体言止め分布の均一性", rawValue: 1 },
  { key: "emotionDirectnessRatio", label: "感情直接表現率", rawValue: 0.04 },
  { key: "logicalConnectiveDensity", label: "論理接続詞密度", rawValue: 0.1 },
  { key: "paragraphTransitionEntropy", label: "段落遷移エントロピー", rawValue: 1 },
  { key: "sentenceLengthBurstiness", label: "文長バースティネス", rawValue: 5 },
];

Deno.test("rawMetricsRows: RawMetrics の16キー全てが1回ずつ現れる", () => {
  const rows = rawMetricsRows(RAW_METRICS, SCORED_METRICS);
  assertEquals(rows.length, 16);
  const keys = rows.map(([key]) => key);
  assertEquals(new Set(keys).size, 16);
  assertEquals(new Set(keys), new Set(Object.keys(RAW_METRICS)));
});

Deno.test("rawMetricsRows: スコア対象外の4項目（charCount/sentenceCount/separatorCount/dialogueCount）が先頭に来る", () => {
  const rows = rawMetricsRows(RAW_METRICS, SCORED_METRICS);
  const leadingKeys = rows.slice(0, 4).map(([key]) => key);
  assertEquals(
    new Set(leadingKeys),
    new Set(["charCount", "sentenceCount", "separatorCount", "dialogueCount"]),
  );
});

Deno.test("rawMetricsRows: スコア対象12項目は scoredMetrics のラベル・並びをそのまま使う（weights.ts のドリフト防止）", () => {
  const rows = rawMetricsRows(RAW_METRICS, SCORED_METRICS);
  const scoredRows = rows.slice(4);
  assertEquals(scoredRows.map(([key]) => key), SCORED_METRICS.map((m) => m.key));
  assertEquals(scoredRows.map(([, label]) => label), SCORED_METRICS.map((m) => m.label));
});

Deno.test("rawMetricsRows: 非スコア4項目はカンマ区切り整数、スコア対象12項目は formatRawValue 相当で表示する", () => {
  const rows = rawMetricsRows(RAW_METRICS, SCORED_METRICS);
  const byKey = Object.fromEntries(rows.map(([key, , value]) => [key, value]));
  assertEquals(byKey.charCount, "3,000");
  assertEquals(byKey.sentenceCount, "60");
  assertEquals(byKey.ttr, "50.0%"); // 1未満はパーセント表示（formatRawValue と同じ規則）
  assertEquals(byKey.sentenceLengthSD, "12.0");
});

Deno.test("averageCharCountLabel: charCount / sentenceCount を小数第1位で表示する", () => {
  assertEquals(averageCharCountLabel({ charCount: 3000, sentenceCount: 60 }), "50.0");
});

Deno.test("averageCharCountLabel: sentenceCount が0なら '-' を返す（0除算フォールバック）", () => {
  assertEquals(averageCharCountLabel({ charCount: 3000, sentenceCount: 0 }), "-");
});
