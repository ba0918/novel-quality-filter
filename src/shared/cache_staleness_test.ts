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

Deno.test("cache_staleness: 採点対象話数フィールド追加前のスキーマ3は stale", () => {
  // schemaVersion 3 のキャッシュは targetEpisodeIndex を持たないため無効化する
  assertEquals(isCacheStale(3), true);
});

Deno.test("cache_staleness: 一文一段落ペナルティ複合化前のスキーマ4は stale", () => {
  // schemaVersion 4 のキャッシュは旧スコアリング（一文一段落ペナルティが文長SD非依存）で
  // 算出されているため、複合条件への変更後は再採点させる
  assertEquals(isCacheStale(4), true);
});

Deno.test("cache_staleness: 行メタデータ追加前のスキーマ5は stale", () => {
  // schemaVersion 5 のキャッシュは lineMetadata を持たず、対象話の再抽出も要るため無効化する
  assertEquals(isCacheStale(5), true);
});

Deno.test("cache_staleness: 行メタデータ追加でスキーマバージョンが6になる", () => {
  assertEquals(CURRENT_SCHEMA_VERSION, 6);
});
