import { assertEquals } from "@std/assert";
import type { LineMetadata, RawMetrics } from "../../src/domain/types.ts";
import type { DatasetRecord } from "./dataset.ts";
import { type LabelRecord2, setExcluded, setLabel, toggleTag } from "./labels_store.ts";
import { analyzeSeparation } from "./analyze_separation.ts";

// avgCharsPerLine を狙って動かせる lineMetadata。totalChars/(totalLines-blank) = avg。
function metaWithAvg(avg: number): LineMetadata {
  return {
    totalLines: 2,
    totalChars: avg * 2,
    blankCount: 0,
    separatorCount: 0,
    narrative: {
      lineCount: 2,
      charCount: avg * 2,
      short20: 0,
      short30: 0,
      chunkCount: 2,
      shortChunk20: 0,
      shortChunk30: 0,
    },
    dialogue: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
    meta: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
    nonTerminal: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
  };
}

interface RecOpts {
  score?: number;
  author?: string;
  bodyHash?: string;
  avg?: number;
  legacy?: boolean; // lineMetadata なし（旧形式）
}

function rec(workId: string, o: RecOpts = {}): DatasetRecord {
  return {
    workId,
    url: `https://kakuyomu.jp/works/${workId}`,
    title: `作品${workId}`,
    author: o.author ?? `著者${workId}`,
    reviewCount: 0,
    totalReviewPoint: 0,
    totalCharacterCount: 0,
    openingType: "normal",
    sampledCount: 1,
    episodeUrl: `https://kakuyomu.jp/works/${workId}/episodes/1`,
    score: o.score ?? 50,
    rawMetrics: {} as RawMetrics,
    blankLineRatio: 0,
    tags: [],
    crawledAt: "2026-08-10T00:00:00.000Z",
    siteWorkId: `kakuyomu:${workId}`,
    captureId: "cap",
    bodyHash: o.bodyHash ?? `hash-${workId}`,
    eligibility: "collected",
    lineMetadata: o.legacy ? undefined : metaWithAvg(o.avg ?? 20),
  };
}

function labelOf(workId: string, quality: "良" | "ゴミ" | "対象外"): LabelRecord2 {
  return setLabel([], `kakuyomu:${workId}`, quality, "t")[0];
}

const THRESHOLD = 40;

Deno.test("analyzeSeparation: 行メタ3指標について 良/ゴミ の平均と差を出力する", () => {
  const records = [
    rec("1", { avg: 40 }), // 良: 平均字/行 高い
    rec("2", { avg: 38 }),
    rec("3", { avg: 10 }), // ゴミ: 平均字/行 低い
    rec("4", { avg: 12 }),
  ];
  const labels = [
    labelOf("1", "良"),
    labelOf("2", "良"),
    labelOf("3", "ゴミ"),
    labelOf("4", "ゴミ"),
  ];

  const report = analyzeSeparation(records, labels, THRESHOLD);
  assertEquals(report.goodCount, 2);
  assertEquals(report.junkCount, 2);
  const avgMetric = report.metrics.find((m) => m.key === "avgCharsPerLine")!;
  assertEquals(avgMetric.goodMean, 39);
  assertEquals(avgMetric.junkMean, 11);
  assertEquals(avgMetric.gap, 28);
  // 3指標すべてが出力される。
  assertEquals(report.metrics.map((m) => m.key).sort(), [
    "avgCharsPerLine",
    "metaRatio",
    "narrativeShortLineRatio30",
  ]);
});

Deno.test("analyzeSeparation: 対象外は良/ゴミの分離度計算に混入しない（C6）", () => {
  const records = [rec("1", { avg: 40 }), rec("2", { avg: 10 }), rec("3", { avg: 99 })];
  const labels = [labelOf("1", "良"), labelOf("2", "ゴミ"), labelOf("3", "対象外")];

  const report = analyzeSeparation(records, labels, THRESHOLD);
  assertEquals(report.goodCount, 1);
  assertEquals(report.junkCount, 1);
  assertEquals(report.scopeExcludedCount, 1);
  // 対象外(avg99)が混ざれば良平均は40でなくなる。混ざっていないことを確認。
  assertEquals(report.metrics.find((m) => m.key === "avgCharsPerLine")!.goodMean, 40);
});

Deno.test("analyzeSeparation: 現行スコアとユーザー判定の食い違いを列挙する（C4/A14）", () => {
  const records = [
    rec("1", { score: 55 }), // 通過だが ゴミ → 通過駄文
    rec("2", { score: 30 }), // 除外だが 良 → 巻き込み良作
    rec("3", { score: 60 }), // 通過で 良 → 一致
  ];
  const labels = [labelOf("1", "ゴミ"), labelOf("2", "良"), labelOf("3", "良")];

  const report = analyzeSeparation(records, labels, THRESHOLD);
  assertEquals(report.mismatches.passedJunk.map((j) => j.record.workId), ["1"]);
  assertEquals(report.mismatches.caughtGood.map((j) => j.record.workId), ["2"]);
});

Deno.test("analyzeSeparation: 旧形式（行メタ欠損）を分離から除外し件数を出す（暗黙間引き禁止）", () => {
  const records = [rec("1", { avg: 40 }), rec("2", { legacy: true })];
  const labels = [labelOf("1", "良"), labelOf("2", "ゴミ")];

  const report = analyzeSeparation(records, labels, THRESHOLD);
  assertEquals(report.legacyExcludedCount, 1);
  assertEquals(report.junkCount, 0); // 旧形式のゴミは分離に入らない
});

Deno.test("analyzeSeparation: 同一作者がアンカーと広域を跨る場合に警告する（C8）", () => {
  const records = [
    rec("1", { author: "同一著者" }), // アンカー（ラベルあり）
    rec("2", { author: "同一著者" }), // 広域（ラベルなし）
    rec("3", { author: "別著者" }),
  ];
  const labels = [labelOf("1", "良")];

  const report = analyzeSeparation(records, labels, THRESHOLD);
  const authorLeaks = report.leakage.filter((w) => w.kind === "author");
  assertEquals(authorLeaks.length, 1);
  assertEquals(authorLeaks[0].value, "同一著者");
});

Deno.test("analyzeSeparation: 同一作品の再取得（重複レコード）は最新スナップショットのみ数える（1作品1票）", () => {
  // --recapture で同一 workId のレコードが2件追記されうる。分離度で二重計上しない。
  const records = [rec("1", { avg: 10 }), rec("1", { avg: 40 })]; // 後勝ち（新しい取得）
  const labels = [labelOf("1", "良")];

  const report = analyzeSeparation(records, labels, THRESHOLD);
  assertEquals(report.goodCount, 1);
  assertEquals(report.metrics.find((m) => m.key === "avgCharsPerLine")!.goodMean, 40);
});

Deno.test("analyzeSeparation: 同一bodyHashがアンカーと広域を跨る場合に警告する（C8・転載重複）", () => {
  const records = [
    rec("1", { bodyHash: "dup" }), // アンカー
    rec("2", { bodyHash: "dup" }), // 広域（別作品・同一本文）
  ];
  const labels = [labelOf("1", "良")];

  const report = analyzeSeparation(records, labels, THRESHOLD);
  const bodyHashLeaks = report.leakage.filter((w) => w.kind === "bodyHash");
  assertEquals(bodyHashLeaks.length, 1);
  assertEquals(bodyHashLeaks[0].value, "dup");
});

Deno.test("analyzeSeparation: 論理除外された作品は分離から外れる", () => {
  const records = [rec("1", { avg: 40 }), rec("2", { avg: 10 })];
  let labels = [labelOf("1", "良"), labelOf("2", "ゴミ")];
  labels = setExcluded(labels, "kakuyomu:2", true, "t");
  // タグは分離には影響しない（付与できることだけ確認）。
  labels = toggleTag(labels, "kakuyomu:1", "+アンカー", "t");

  const report = analyzeSeparation(records, labels, THRESHOLD);
  assertEquals(report.junkCount, 0);
  assertEquals(report.logicallyExcludedCount, 1);
});
