// detail_join.js（Detail パネルの正本×実験並列表示のためのjoinロジック）の単体テスト。
// 独立レビューで「join_filter.js/line_meta.jsと同水準の分岐ロジックを持つのにapp.js内に
// 埋もれてテストが無い」と指摘され、切り出し+テスト化した（BLOCKではなくWARN、テスト可能性の
// 観点で対応）。

import { assertEquals } from "@std/assert";
import { joinMetrics, joinPenalties } from "./detail_join.js";

// deno-lint-ignore no-explicit-any
function metric(overrides: Record<string, any>): any {
  return {
    key: "k",
    label: "指標",
    rawValue: 0,
    normalizedValue: 0,
    weight: 0,
    contribution: 0,
    flagged: false,
    reason: "",
    ...overrides,
  };
}

Deno.test("joinMetrics: keyで正本/実験をjoinし、canonicalの並び順・labelを保持する", () => {
  const canonical = [
    metric({ key: "a", label: "A", contribution: 1 }),
    metric({ key: "b", label: "B", contribution: 2 }),
  ];
  const experiment = [
    metric({ key: "b", label: "B", contribution: 3 }),
    metric({ key: "a", label: "A", contribution: 1 }),
  ];
  const rows = joinMetrics(canonical, experiment);
  assertEquals(rows.map((r: { key: string }) => r.key), ["a", "b"]);
  assertEquals(rows.map((r: { label: string }) => r.label), ["A", "B"]);
});

Deno.test("joinMetrics: contributionが同じ行はdiffer=false・delta=0になる", () => {
  const canonical = [metric({ key: "a", contribution: 5 })];
  const experiment = [metric({ key: "a", contribution: 5 })];
  const [row] = joinMetrics(canonical, experiment);
  assertEquals(row.differ, false);
  assertEquals(row.delta, 0);
});

Deno.test("joinMetrics: contributionが異なる行はdiffer=true・deltaが実験−正本になる", () => {
  const canonical = [metric({ key: "a", contribution: 9.63 })];
  const experiment = [metric({ key: "a", contribution: 8.35 })];
  const [row] = joinMetrics(canonical, experiment);
  assertEquals(row.differ, true);
  assertEquals(Number(row.delta.toFixed(2)), -1.28);
});

function penalty(label: string, multiplier: number) {
  return { label, multiplier };
}

Deno.test("joinPenalties: 両側で発火した規則はcanonical/experimentどちらも値を持つ", () => {
  const rows = joinPenalties([penalty("A", 0.65)], [penalty("A", 0.8)]);
  assertEquals(rows, [{
    label: "A",
    canonical: penalty("A", 0.65),
    experiment: penalty("A", 0.8),
  }]);
});

Deno.test("joinPenalties: 正本のみ発火した規則はexperimentがundefinedになる", () => {
  const rows = joinPenalties([penalty("A", 0.65)], []);
  assertEquals(rows, [{ label: "A", canonical: penalty("A", 0.65), experiment: undefined }]);
});

Deno.test("joinPenalties: 実験のみ発火した規則はcanonicalがundefinedになる", () => {
  const rows = joinPenalties([], [penalty("B", 0.55)]);
  assertEquals(rows, [{ label: "B", canonical: undefined, experiment: penalty("B", 0.55) }]);
});

Deno.test("joinPenalties: どちらも非発火なら空配列を返す", () => {
  assertEquals(joinPenalties([], []), []);
});

Deno.test("joinPenalties: 同じラベルは重複せず1行にまとまる", () => {
  const rows = joinPenalties([penalty("A", 0.65)], [penalty("A", 0.8), penalty("B", 0.55)]);
  assertEquals(rows.map((r: { label: string }) => r.label), ["A", "B"]);
});
