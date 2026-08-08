import { assert, assertEquals } from "@std/assert";
import { initTokenizer, tokenize } from "../tokenizer/mod.ts";
import { analyzeAll } from "../analyzer/mod.ts";
import { calculateScore } from "./mod.ts";
import type { RawMetrics } from "../types.ts";
import { PENALTY_RULES } from "./weights.ts";

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
  name: "scoring: low-quality-01 scores below 40",
  async fn() {
    await initTokenizer();
    const score = await scoreFixture("low-quality-01.txt");
    console.log(`  low-quality-01: ${score}/100`);
    assert(score <= 40, `Expected <= 40, got ${score}`);
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

// --- penalties フィールド検証 ---

function makeSyntheticMetrics(overrides: Partial<RawMetrics> = {}): RawMetrics {
  return {
    charCount: 5000,
    sentenceCount: 100,
    sentenceLengthSD: 15,
    singleSentParaRatio: 0.2,
    paragraphLengthSD: 20,
    separatorCount: 1,
    separatorFrequency: 0.01,
    ttr: 0.5,
    dialogueCount: 30,
    dialogueEndingVariety: 0.6,
    descriptionDensitySD: 0.03,
    taigendomeEntropy: 1.0,
    emotionDirectnessRatio: 0.02,
    logicalConnectiveDensity: 0.1,
    paragraphTransitionEntropy: 0.8,
    sentenceLengthBurstiness: 5.0,
    ...overrides,
  };
}

Deno.test("scoring: penalties is empty when no penalty rule fires", () => {
  // すべてのメトリクスが十分に高い（ペナルティ条件を満たさない）
  const raw = makeSyntheticMetrics();
  const result = calculateScore(raw);
  assertEquals(result.penalties.length, 0, "No penalties should fire for healthy metrics");
});

Deno.test("scoring: penalties contains fired rule with label and multiplier", () => {
  // singleSentParaRatio ペナルティを発動させる（閾値 0.30 未満）
  const raw = makeSyntheticMetrics({
    singleSentParaRatio: 0.95, // normalizedValue = min(0.95, 1) = 0.95, inverted = 1 - 0.95 = 0.05 < 0.30
  });
  const result = calculateScore(raw);

  const singleSentPenalty = result.penalties.find(
    (p) => p.label !== "" && p.multiplier === 0.65,
  );
  assert(singleSentPenalty, "singleSentParaRatio penalty should fire");
  assert(singleSentPenalty.label.length > 0, "Penalty should have a human-readable label");
  assertEquals(singleSentPenalty.multiplier, 0.65);
});

Deno.test("scoring: all PenaltyRules have a label", () => {
  for (const rule of PENALTY_RULES) {
    assert(
      typeof rule.label === "string" && rule.label.length > 0,
      `PenaltyRule with multiplier ${rule.penaltyMultiplier} should have a non-empty label`,
    );
  }
});

Deno.test({
  name: "scoring: low-quality fixture has penalties",
  async fn() {
    await initTokenizer();
    const text = await Deno.readTextFile(`${FIXTURES_DIR}low-quality-01.txt`);
    const tokens = tokenize(text);
    const raw = analyzeAll(text, tokens, tokenize);
    const result = calculateScore(raw);
    assert(result.penalties.length > 0, "Low quality text should have penalties");
    for (const p of result.penalties) {
      assert(p.label.length > 0, "Each penalty should have a label");
      assert(p.multiplier > 0 && p.multiplier < 1, "Multiplier should be between 0 and 1");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "scoring: high-quality fixture has no penalties",
  async fn() {
    await initTokenizer();
    const text = await Deno.readTextFile(`${FIXTURES_DIR}high-quality-01.txt`);
    const tokens = tokenize(text);
    const raw = analyzeAll(text, tokens, tokenize);
    const result = calculateScore(raw);
    assertEquals(result.penalties.length, 0, "High quality text should have no penalties");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
