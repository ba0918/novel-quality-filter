import { assert } from "@std/assert";
import { initTokenizer, tokenize } from "../tokenizer/mod.ts";
import { analyzeAll } from "../analyzer/mod.ts";
import { calculateScore } from "./mod.ts";

const FIXTURES_DIR = new URL("../../../tests/fixtures/", import.meta.url).pathname;

async function scoreFixture(filename: string): Promise<number> {
  const text = await Deno.readTextFile(`${FIXTURES_DIR}${filename}`);
  const tokens = tokenize(text);
  const raw = analyzeAll(text, tokens, tokenize);
  const { score } = calculateScore(raw);
  return score;
}

Deno.test({
  name: "scoring: high-quality-01 scores above 70",
  async fn() {
    await initTokenizer();
    const score = await scoreFixture("high-quality-01.txt");
    console.log(`  high-quality-01: ${score}/100`);
    assert(score >= 70, `Expected >= 70, got ${score}`);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "scoring: low-quality-01 scores below 35",
  async fn() {
    await initTokenizer();
    const score = await scoreFixture("low-quality-01.txt");
    console.log(`  low-quality-01: ${score}/100`);
    assert(score <= 35, `Expected <= 35, got ${score}`);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "scoring: ScoreResult contains metric reasons",
  async fn() {
    await initTokenizer();
    const text = await Deno.readTextFile(`${FIXTURES_DIR}low-quality-01.txt`);
    const tokens = tokenize(text);
    const raw = analyzeAll(text, tokens, tokenize);
    const result = calculateScore(raw);

    assert(result.metrics.length > 0, "Should have metric results");
    const flagged = result.metrics.filter((m) => m.flagged);
    assert(flagged.length > 0, "Low quality text should have flagged metrics");
    for (const m of flagged) {
      assert(m.reason.length > 0, `Flagged metric ${m.key} should have a reason`);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
