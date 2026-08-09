import { assertEquals } from "@std/assert";
import { CURRENT_SCHEMA_VERSION, isCacheStale } from "./cache-staleness.ts";

Deno.test("cache_staleness: cache with current schema version is fresh", () => {
  assertEquals(isCacheStale(CURRENT_SCHEMA_VERSION), false);
});

Deno.test("cache_staleness: cache with older schema version is stale", () => {
  assertEquals(isCacheStale(1), true);
});

Deno.test("cache_staleness: cache with no schema version (undefined) is stale", () => {
  assertEquals(isCacheStale(undefined), true);
});

Deno.test("cache_staleness: cache with future schema version is not stale", () => {
  // Future versions should not be treated as stale
  assertEquals(isCacheStale(CURRENT_SCHEMA_VERSION + 1), false);
});

Deno.test("cache_staleness: 開幕形式フィールド追加前のスキーマ2は stale", () => {
  // schemaVersion 2 のキャッシュは openingType / sampledCount を持たないため無効化する
  assertEquals(isCacheStale(2), true);
});

Deno.test("cache_staleness: 開幕形式フィールド追加でスキーマバージョンが3になる", () => {
  assertEquals(CURRENT_SCHEMA_VERSION, 3);
});
