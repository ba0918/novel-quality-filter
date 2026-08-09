import { assertEquals } from "@std/assert";
import { extractNarrative } from "./narrative.ts";

Deno.test("narrative: removes dialogue", () => {
  assertEquals(
    extractNarrative("「悲しい」と言った。雨が降る。"),
    "と言った。雨が降る。",
  );
});

Deno.test("narrative: text without dialogue is unchanged", () => {
  assertEquals(extractNarrative("雨が降る。風が吹く。"), "雨が降る。風が吹く。");
});
