import { assertEquals } from "@std/assert";
import type { RawMetrics } from "../../src/domain/types.ts";
import type { DatasetRecord } from "./dataset.ts";
import { type LabelRecord2, setLabel } from "./labels_store.ts";
import { joinLabels } from "./analyze_separation.ts";

interface RecOpts {
  score?: number;
  avg?: number; // totalChars を通じて識別用の値を持たせる
}

function rec(workId: string, o: RecOpts = {}): DatasetRecord {
  return {
    workId,
    url: `https://kakuyomu.jp/works/${workId}`,
    title: `作品${workId}`,
    author: `著者${workId}`,
    reviewCount: 0,
    totalReviewPoint: 0,
    totalCharacterCount: o.avg ?? 0,
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
    bodyHash: `hash-${workId}`,
    eligibility: "collected",
  };
}

function labelOf(workId: string, quality: "良" | "ゴミ"): LabelRecord2 {
  return setLabel([], `kakuyomu:${workId}`, quality, "t")[0];
}

Deno.test("joinLabels: siteWorkId でラベルを突き合わせる（ラベルなしは undefined）", () => {
  const records = [rec("1"), rec("2")];
  const labels = [labelOf("1", "良")];

  const joined = joinLabels(records, labels);
  assertEquals(joined.length, 2);
  assertEquals(joined.find((j) => j.record.workId === "1")!.label!.quality, "良");
  assertEquals(joined.find((j) => j.record.workId === "2")!.label, undefined);
});

Deno.test("joinLabels: 同一作品の再取得（重複レコード）は最新スナップショットのみ残す（1作品1票）", () => {
  // --recapture で同一 workId が2件追記されうる。後勝ちで最新1件に畳む。
  const records = [rec("1", { avg: 10 }), rec("1", { avg: 40 })];
  const labels = [labelOf("1", "良")];

  const joined = joinLabels(records, labels);
  assertEquals(joined.length, 1);
  assertEquals(joined[0].record.totalCharacterCount, 40);
});
