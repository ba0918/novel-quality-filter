import { assertEquals } from "@std/assert";
import { splitSentences } from "./sentences.ts";

Deno.test("sentences: splits on 。 and trims", () => {
  assertEquals(splitSentences(" 文一。文二。 "), ["文一", "文二"]);
});

Deno.test("sentences: drops empty segments", () => {
  assertEquals(splitSentences("文一。。文二"), ["文一", "文二"]);
});

Deno.test("sentences: empty text returns empty array", () => {
  assertEquals(splitSentences(""), []);
});

Deno.test("sentences: whitespace-only segment is dropped", () => {
  assertEquals(splitSentences("文一。   。文二"), ["文一", "文二"]);
});
