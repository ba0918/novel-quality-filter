import { assertEquals } from "@std/assert";
import { type DatasetRecord, parseJsonl, seenWorkIds, toJsonl } from "./dataset.ts";

function rec(workId: string, score: number): DatasetRecord {
  return {
    workId,
    url: `https://kakuyomu.jp/works/${workId}`,
    title: `作品${workId}`,
    author: "著者",
    reviewCount: 10,
    totalReviewPoint: 20,
    totalCharacterCount: 30000,
    openingType: "normal",
    sampledCount: 1,
    episodeUrl: `https://kakuyomu.jp/works/${workId}/episodes/1`,
    score,
    // deno-lint-ignore no-explicit-any
    rawMetrics: { singleSentParaRatio: 0.5, sentenceLengthSD: 20 } as any,
    blankLineRatio: 0.3,
    tags: ["異世界"],
    crawledAt: "2026-08-09T00:00:00Z",
  };
}

Deno.test("parseJsonl: 各行を1レコードにし、空行は飛ばす", () => {
  const text = `${JSON.stringify(rec("111", 50))}\n\n${JSON.stringify(rec("222", 30))}\n`;
  const parsed = parseJsonl(text);
  assertEquals(parsed.length, 2);
  assertEquals(parsed[0].workId, "111");
  assertEquals(parsed[1].score, 30);
});

Deno.test("parseJsonl: 空文字列は空配列", () => {
  assertEquals(parseJsonl(""), []);
  assertEquals(parseJsonl("\n\n"), []);
});

Deno.test("toJsonl→parseJsonl: 往復でレコードが保存される", () => {
  const line = toJsonl(rec("333", 42));
  assertEquals(line.endsWith("\n"), true);
  const [back] = parseJsonl(line);
  assertEquals(back.workId, "333");
  assertEquals(back.score, 42);
});

Deno.test("seenWorkIds: レコード群から workId 集合を作る", () => {
  const set = seenWorkIds([rec("111", 50), rec("222", 30), rec("111", 51)]);
  assertEquals(set.has("111"), true);
  assertEquals(set.has("222"), true);
  assertEquals(set.size, 2);
});
