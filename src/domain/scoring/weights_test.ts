import { assert, assertEquals } from "@std/assert";
import { PENALTY_RULES } from "./weights.ts";

// 較正で確定した「地の文短行14 の過多」ペナルティが weights.ts に登録されていることを、
// 存在検査として固定する（挙動テストは mod_test.ts 側）。
Deno.test("weights: PENALTY_RULES に「地の文短行14 の過多」が登録され、evaluate ベースで multiplier 0.85", () => {
  const rule = PENALTY_RULES.find((r) => r.label === "地の文短行14 の過多");
  assert(rule, "「地の文短行14 の過多」ペナルティが未登録");
  assertEquals(rule.penaltyMultiplier, 0.85);
  assert(rule.evaluate, "短行14 ペナルティは evaluate ベース（lineMetadata を要する）");
});

// 較正で「一文一段落の過多」は駄 8/10 に発火 = 強すぎる観測を得た。0.65 → 0.75 に緩めた変更を
// 明示的に固定する。将来のパラメータいじりでうっかり戻すのを検出できるようにする。
Deno.test("weights: 「一文一段落の過多」ペナルティは multiplier 0.75 に緩和されている", () => {
  const rule = PENALTY_RULES.find((r) => r.label === "一文一段落の過多");
  assert(rule, "「一文一段落の過多」ペナルティが見つからない");
  assertEquals(rule.penaltyMultiplier, 0.75);
});
