import { assert, assertEquals } from "@std/assert";
import { analyzeSentenceLengths } from "./sentence_length.ts";

Deno.test("sentence_length: uniform text has low SD", () => {
  const text = "短い文だ。短い文だ。短い文だ。短い文だ。短い文だ。";
  const { sd } = analyzeSentenceLengths(text);
  assertEquals(sd, 0);
});

Deno.test("sentence_length: varied text has higher SD", () => {
  const text =
    "短い。これは少し長めの文章になっている。あ。とても長い文章がここに入ってくるのでかなりの長さになるはずである。中。";
  const { sd } = analyzeSentenceLengths(text);
  assert(sd > 5, `SD should be > 5, got ${sd}`);
});

Deno.test("sentence_length: empty text returns 0", () => {
  const { sd, lengths } = analyzeSentenceLengths("");
  assertEquals(sd, 0);
  assertEquals(lengths.length, 0);
});
