import { assertEquals } from "@std/assert";
import { analyzeBlankLineRatio } from "./blank_line.ts";

Deno.test("blank_line: 空行が無ければ 0", () => {
  assertEquals(analyzeBlankLineRatio("あ。\nい。\nう。"), 0);
});

Deno.test("blank_line: 全ての内容行の間に空行があると高い比率になる", () => {
  // ["あ。","","い。","","う。"] → 空行2/全5
  assertEquals(analyzeBlankLineRatio("あ。\n\nい。\n\nう。"), 0.4);
});

Deno.test("blank_line: 内容行が無ければ 0", () => {
  assertEquals(analyzeBlankLineRatio(""), 0);
});
