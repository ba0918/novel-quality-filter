import { assert, assertEquals } from "@std/assert";
import { analyzeSentenceLengthBurstiness } from "./sentence_length_burstiness.ts";

function makeSentences(lengths: number[]): string {
  return lengths.map((l) => "あ".repeat(l)).join("。") + "。";
}

Deno.test({
  name: "burstiness: uniform variation has low burstiness",
  fn() {
    const lengths: number[] = [];
    for (let i = 0; i < 40; i++) {
      lengths.push(i % 2 === 0 ? 20 : 30);
    }
    const result = analyzeSentenceLengthBurstiness(makeSentences(lengths));
    assert(result.burstiness < 1.0, `Expected low burstiness, got ${result.burstiness}`);
  },
});

Deno.test({
  name: "burstiness: varied pacing has high burstiness",
  fn() {
    const lengths: number[] = [];
    for (let i = 0; i < 10; i++) lengths.push(20 + (i % 3));
    for (let i = 0; i < 10; i++) lengths.push(i % 2 === 0 ? 5 : 50);
    for (let i = 0; i < 10; i++) lengths.push(25 + (i % 2));
    for (let i = 0; i < 10; i++) lengths.push(i % 2 === 0 ? 3 : 60);
    const result = analyzeSentenceLengthBurstiness(makeSentences(lengths));
    assert(result.burstiness > 5.0, `Expected high burstiness, got ${result.burstiness}`);
  },
});

Deno.test({
  name: "burstiness: too few sentences returns zero",
  fn() {
    const text = makeSentences([10, 20, 30, 10, 20]);
    const result = analyzeSentenceLengthBurstiness(text);
    assertEquals(result.burstiness, 0);
    assertEquals(result.windowSDs.length, 0);
  },
});

Deno.test({
  name: "burstiness: empty text returns zero",
  fn() {
    const result = analyzeSentenceLengthBurstiness("");
    assertEquals(result.burstiness, 0);
  },
});
