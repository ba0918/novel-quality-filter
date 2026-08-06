import { assert, assertEquals } from "@std/assert";
import { analyzeParagraphLengths, analyzeSingleSentParagraphs } from "./paragraph.ts";

Deno.test("paragraph: all single-sentence paragraphs have high ratio", () => {
  const text = "一つ目の文。\n二つ目の文。\n三つ目の文。\n四つ目の文。";
  const { ratio } = analyzeSingleSentParagraphs(text);
  assertEquals(ratio, 1.0);
});

Deno.test("paragraph: multi-sentence paragraphs have low ratio", () => {
  const text = "一つ目の文。二つ目の文。三つ目の文。\n四つ目の文。五つ目の文。";
  const { ratio } = analyzeSingleSentParagraphs(text);
  assertEquals(ratio, 0);
});

Deno.test("paragraph: dialogue lines are excluded from ratio", () => {
  const text = "「これは会話文です」\n地の文が入る。\n「これも会話文」";
  const { total, ratio } = analyzeSingleSentParagraphs(text);
  assert(total > 0);
  assert(ratio <= 1.0);
});

Deno.test("paragraph: separator lines are excluded", () => {
  const text = "文章。\n---\n別の文章。";
  const { total } = analyzeSingleSentParagraphs(text);
  assertEquals(total, 2);
});

Deno.test("paragraph_length: uniform paragraphs have low SD", () => {
  const text = "短い段落。\n短い段落。\n短い段落。\n短い段落。";
  const { sd } = analyzeParagraphLengths(text);
  assertEquals(sd, 0);
});

Deno.test("paragraph_length: varied paragraphs have higher SD", () => {
  const text =
    "短い。\nこれはとても長い段落で、様々な描写が含まれており、読者の心に響く表現が詰まっている。朝日が差し込む窓辺で、主人公は静かにコーヒーを飲んでいた。\nう。";
  const { sd } = analyzeParagraphLengths(text);
  assert(sd > 10, `SD should be > 10, got ${sd}`);
});
