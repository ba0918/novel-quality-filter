import { assert, assertEquals } from "@std/assert";
import { combinePenaltyMultipliers, PENALTY_RULES } from "./weights.ts";

// 較正で確定した「地の文短行14 の過多」ペナルティが weights.ts に登録されていることを、
// 存在検査として固定する（挙動テストは mod_test.ts 側）。
Deno.test("weights: PENALTY_RULES に「地の文短行14 の過多」が登録され、evaluate ベースで multiplier 0.80", () => {
  // rev 20260811224443 で multiplier を 0.85 → 0.80 に微強化。narrative シグナルを penalty
  // 側で活用する家族 0 の設計。
  const rule = PENALTY_RULES.find((r) => r.label === "地の文短行14 の過多");
  assert(rule, "「地の文短行14 の過多」ペナルティが未登録");
  assertEquals(rule.penaltyMultiplier, 0.80);
  assert(rule.evaluate, "短行14 ペナルティは evaluate ベース（lineMetadata を要する）");
});

// 較正で「一文一段落の過多」は駄 8/10 に発火 = 強すぎる観測を得た。0.65 → 0.75 に緩めた変更を
// 明示的に固定する。将来のパラメータいじりでうっかり戻すのを検出できるようにする。
Deno.test("weights: 「一文一段落の過多」ペナルティは multiplier 0.75 に緩和されている", () => {
  const rule = PENALTY_RULES.find((r) => r.label === "一文一段落の過多");
  assert(rule, "「一文一段落の過多」ペナルティが見つからない");
  assertEquals(rule.penaltyMultiplier, 0.75);
});

// 案 A (min-mult 合成): n=25 実測で「複数 penalty rule の乗算合成が良側境界作品の主犯」と判明。
// 例: 良「スキルレベル」base 56.7 が一文一段落過多(0.75)+短行14過多(0.80)の乗算(0.60)で 34.0 に潰れた。
// 発火した rule 群のうち「最も強い penalty (最小 multiplier)」1 個だけを適用する min-mult 合成に切り替え、
// 二重発火による過剰減点を防ぐ。単発発火時は乗算/最小どちらも同値なので既存駄側の判別は温存する。
Deno.test("weights: combinePenaltyMultipliers は発火なし時 1.0 を返す", () => {
  assertEquals(combinePenaltyMultipliers([]), 1.0);
});

Deno.test("weights: combinePenaltyMultipliers は単発発火時その multiplier をそのまま返す", () => {
  assertEquals(combinePenaltyMultipliers([0.75]), 0.75);
  assertEquals(combinePenaltyMultipliers([0.55]), 0.55);
});

Deno.test("weights: combinePenaltyMultipliers は複数発火時 min(multipliers) を返す (min-mult 合成)", () => {
  // 一文一段落過多(0.75) + 短行14過多(0.80) → 乗算なら 0.60、min-mult なら 0.75
  assertEquals(combinePenaltyMultipliers([0.75, 0.80]), 0.75);
  // 文長ばらつき不足(0.55) + 一文一段落過多(0.75) + 短行14過多(0.80) → 乗算 0.33、min-mult 0.55
  assertEquals(combinePenaltyMultipliers([0.55, 0.75, 0.80]), 0.55);
});
