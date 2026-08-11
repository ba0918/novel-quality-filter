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

Deno.test("cache_staleness: 短行14 集計追加前のスキーマ6は stale", () => {
  // schemaVersion 6 のキャッシュは lineMetadata に short14/shortChunk14 を持たない。
  // 型は必ず存在する数値として宣言しているため、undefined を許すと NaN 波及の原因になる。
  // 較正実験の未評価候補としてデータだけ増やすが、cache の型完全性は保つ。
  assertEquals(isCacheStale(6), true);
});

Deno.test("cache_staleness: 短行14 ペナルティ導入前のスキーマ7は stale", () => {
  // schemaVersion 7 のキャッシュは「地の文短行14 の過多」ペナルティを含まない古い式で
  // 算出されている。スコアの意味論が変わるため再算出させる必要がある。
  assertEquals(isCacheStale(7), true);
});

Deno.test("cache_staleness: 表示較正カーブ導入前のスキーマ8は stale", () => {
  // schemaVersion 8 のキャッシュは表示較正カーブを通っていない生の base × penalty で
  // 算出されている。表示尺度が変わる（良側 49→51 等）ため、古い score をそのまま
  // 表示すると新旧が混在する。再算出させる必要がある。
  assertEquals(isCacheStale(8), true);
});

Deno.test("cache_staleness: 12 指標構造整地前のスキーマ9は stale", () => {
  // schemaVersion 9 のキャッシュは 12 指標構造整地 (rev 20260811224443) 前の
  // weight/penalty で算出されている。指標セット (4 指標 weight 0 化 + 判別 4 指標に weight
  // 再配分) + 短行14 penalty multiplier 0.85→0.80 でスコアが変わるため再算出させる。
  assertEquals(isCacheStale(9), true);
});

Deno.test("cache_staleness: 12 指標構造整地でスキーマバージョンが 10 になった", () => {
  // 元は「== 10」を assert する固定だったが、後続改修 (penalty 合成 min-mult 化) で
  // さらに bump したため下限 assert に緩和する。
  assertEquals(CURRENT_SCHEMA_VERSION >= 10, true);
});

Deno.test("cache_staleness: penalty 合成 min-mult 化前のスキーマ10は stale", () => {
  // schemaVersion 10 のキャッシュは複数 penalty rule 発火時に「乗算合成」で算出されている。
  // min-mult 合成 (最も強い 1 個だけ base に掛ける) に変わったことで、二重発火作品のスコアが
  // 押し上がる (例: 良「スキルレベル」34→46)。スコアの絶対値が変わるため再算出させる。
  assertEquals(isCacheStale(10), true);
});

Deno.test("cache_staleness: penalty 合成 min-mult 化でスキーマバージョンが 11 になる", () => {
  assertEquals(CURRENT_SCHEMA_VERSION, 11);
});
