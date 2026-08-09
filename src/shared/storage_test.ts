import "npm:fake-indexeddb@6/auto";
import { assertEquals } from "@std/assert";
import { CURRENT_SCHEMA_VERSION } from "./cache-staleness.ts";
import { clearAll, getScore, putScore } from "./storage.ts";

Deno.test("storage: putScore した entry が開幕形式フィールドごと復元される", async () => {
  await clearAll();

  const lineMetadata = {
    totalLines: 3,
    totalChars: 14,
    blankCount: 1,
    separatorCount: 0,
    narrative: {
      lineCount: 1,
      charCount: 8,
      short20: 1,
      short30: 1,
      chunkCount: 1,
      shortChunk20: 1,
      shortChunk30: 1,
    },
    dialogue: { lineCount: 1, charCount: 6, short20: 1, short30: 1 },
    meta: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
    nonTerminal: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
  };

  await putScore({
    workId: "storage-roundtrip-1",
    score: 42,
    metrics: [],
    penalties: [],
    openingType: "character-intro",
    sampledCount: 2,
    targetEpisodeIndex: 1,
    lineMetadata,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scoredAt: 1700000000000,
    episodeUrl: "https://kakuyomu.jp/works/1/episodes/2",
  });

  const restored = await getScore("storage-roundtrip-1");

  assertEquals(restored?.score, 42);
  assertEquals(restored?.openingType, "character-intro");
  assertEquals(restored?.sampledCount, 2);
  assertEquals(restored?.targetEpisodeIndex, 1);
  assertEquals(restored?.lineMetadata, lineMetadata);
  assertEquals(restored?.episodeUrl, "https://kakuyomu.jp/works/1/episodes/2");
});

Deno.test("storage: 開幕形式フィールドを持たない entry は undefined として復元される", async () => {
  await clearAll();

  await putScore({
    workId: "storage-roundtrip-2",
    score: 10,
    metrics: [],
    penalties: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scoredAt: 1700000000000,
    episodeUrl: "https://kakuyomu.jp/works/2/episodes/1",
  });

  const restored = await getScore("storage-roundtrip-2");

  assertEquals(restored?.openingType, undefined);
  assertEquals(restored?.sampledCount, undefined);
  assertEquals(restored?.targetEpisodeIndex, undefined);
  assertEquals(restored?.lineMetadata, undefined);
});
