import { assertEquals } from "@std/assert";
import { countSeparators } from "./separator.ts";

Deno.test("separator: counts --- separators", () => {
  const text = "文章。\n---\n別の文章。\n---\nさらに文章。";
  assertEquals(countSeparators(text), 2);
});

Deno.test("separator: counts ＊＊＊ separators", () => {
  const text = "文章。\n＊＊＊\n別の文章。";
  assertEquals(countSeparators(text), 1);
});

Deno.test("separator: no separators returns 0", () => {
  assertEquals(countSeparators("普通の文章。改行を含む。"), 0);
});

Deno.test("separator: inline --- is not counted", () => {
  const text = "この文章には---ハイフンが含まれている。";
  assertEquals(countSeparators(text), 0);
});
