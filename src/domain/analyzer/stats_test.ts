import { assertEquals } from "@std/assert";
import { mean, standardDeviation } from "./stats.ts";

Deno.test("stats: mean computes average", () => {
  assertEquals(mean([1, 2, 3, 4]), 2.5);
});

Deno.test("stats: standardDeviation of known set", () => {
  assertEquals(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]), 2);
});

Deno.test("stats: standardDeviation of empty is zero", () => {
  assertEquals(standardDeviation([]), 0);
});

Deno.test("stats: standardDeviation of single element is zero", () => {
  assertEquals(standardDeviation([5]), 0);
});
