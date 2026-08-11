import { assertEquals } from "@std/assert";
import type { LineMetadata } from "../../src/domain/types.ts";
import { type DatasetRecord, parseJsonl, seenWorkIds, toJsonl } from "./dataset.ts";

function lineMeta(): LineMetadata {
  return {
    totalLines: 4,
    totalChars: 40,
    blankCount: 1,
    separatorCount: 0,
    narrative: {
      lineCount: 2,
      charCount: 30,
      short14: 0,
      short20: 0,
      short30: 1,
      chunkCount: 2,
      shortChunk14: 0,
      shortChunk20: 0,
      shortChunk30: 0,
    },
    dialogue: { lineCount: 1, charCount: 10, short14: 0, short20: 1, short30: 1 },
    meta: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
    nonTerminal: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
  };
}

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

Deno.test("parseJsonl: 旧形式（行メタ・captureId 欠損）と新形式が混在しても読める（後方互換）", () => {
  const legacy = rec("111", 50); // lineMetadata / captureId / siteWorkId / bodyHash なし
  const fresh: DatasetRecord = {
    ...rec("222", 60),
    siteWorkId: "kakuyomu:222",
    captureId: "cap-x",
    bodyHash: "abc123",
    eligibility: "collected",
    lineMetadata: lineMeta(),
  };
  const parsed = parseJsonl(`${JSON.stringify(legacy)}\n${JSON.stringify(fresh)}\n`);
  assertEquals(parsed.length, 2);
  // 旧レコードは新フィールドが undefined として読める。
  assertEquals(parsed[0].lineMetadata, undefined);
  assertEquals(parsed[0].captureId, undefined);
  // 新レコードは行メタ・原本参照を保持する。
  assertEquals(parsed[1].siteWorkId, "kakuyomu:222");
  assertEquals(parsed[1].lineMetadata, lineMeta());
  assertEquals(parsed[1].bodyHash, "abc123");
});

Deno.test("toJsonl→parseJsonl: 新形式レコードは行メタ・captureId ごと往復する", () => {
  const fresh: DatasetRecord = {
    ...rec("333", 42),
    siteWorkId: "kakuyomu:333",
    captureId: "cap-y",
    bodyHash: "def456",
    eligibility: "collected",
    lineMetadata: lineMeta(),
  };
  const [back] = parseJsonl(toJsonl(fresh));
  assertEquals(back, fresh);
});

Deno.test("seenWorkIds: レコード群から workId 集合を作る", () => {
  const set = seenWorkIds([rec("111", 50), rec("222", 30), rec("111", 51)]);
  assertEquals(set.has("111"), true);
  assertEquals(set.has("222"), true);
  assertEquals(set.size, 2);
});
