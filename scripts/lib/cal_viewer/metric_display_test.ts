// metric_display.js（指標内訳テーブルの2軸表示ヘルパ）を検証する。
// 「max（潜在影響力pt）」「寄与の達成率による4段階tier」「-pt（直接減点額）」の3計算を
// app.js から切り出した純関数として扱う。

import { assertEquals } from "@std/assert";
import { contributionTier, deficit, maxContribution } from "./metric_display.js";

Deno.test("maxContribution: weight×100で満点時の潜在pt を返す", () => {
  assertEquals(maxContribution(0.3), 30);
  assertEquals(maxContribution(0.08), 8);
  assertEquals(maxContribution(0), 0);
});

Deno.test("contributionTier: 達成率0.80以上はgood", () => {
  assertEquals(contributionTier(24, 30), "good"); // ratio = 0.80 ちょうど
  assertEquals(contributionTier(30, 30), "good"); // ratio = 1.0
});

Deno.test("contributionTier: 達成率0.60以上0.80未満はneutral", () => {
  assertEquals(contributionTier(18, 30), "neutral"); // ratio = 0.60 ちょうど
  assertEquals(contributionTier(23.9, 30), "neutral"); // ratio ≈ 0.797
});

Deno.test("contributionTier: 達成率0.40以上0.60未満はcaution", () => {
  assertEquals(contributionTier(12, 30), "caution"); // ratio = 0.40 ちょうど
  assertEquals(contributionTier(17.9, 30), "caution"); // ratio ≈ 0.597
});

Deno.test("contributionTier: 達成率0.40未満はbad", () => {
  assertEquals(contributionTier(0, 30), "bad");
  assertEquals(contributionTier(11.9, 30), "bad"); // ratio ≈ 0.397
});

Deno.test("contributionTier: maxContributionが0（weight 0）ならゼロ除算を避けneutralを返す", () => {
  assertEquals(contributionTier(0, 0), "neutral");
});

Deno.test("deficit: maxContributionからcontributionを引いた直接減点額を返す", () => {
  assertEquals(deficit(3.2, 30), 26.8);
  assertEquals(deficit(7.34, 12), 4.66);
});

Deno.test("deficit: 達成済み（contribution === maxContribution）は0", () => {
  assertEquals(deficit(30, 30), 0);
});

Deno.test("deficit: 浮動小数の丸め誤差でマイナスに振れても0未満にはならない", () => {
  // 30 - 30.0000000000001 のような浮動小数誤差を模す
  assertEquals(deficit(30.0000000000001, 30), 0);
});
