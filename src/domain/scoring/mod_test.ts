import { assert, assertEquals } from "@std/assert";
import { initTokenizer, tokenize } from "../tokenizer/mod.ts";
import { analyzeAll } from "../analyzer/mod.ts";
import { calculateScore } from "./mod.ts";
import type { CategoryCount, LineMetadata, NarrativeCount, RawMetrics } from "../types.ts";
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

Deno.test("scoring: 一文一段落比率が高く文長SDも小さいと過多ペナルティが発火する", () => {
  // 一文一段落が多く（比率 0.95）、かつ文長のばらつきも小さい（SD 10 → 正規化 0.4）単調な文章
  const raw = makeSyntheticMetrics({
    singleSentParaRatio: 0.95,
    sentenceLengthSD: 10,
  });
  const result = calculateScore(raw);

  const singleSentPenalty = result.penalties.find(
    (p) => p.label !== "" && p.multiplier === 0.75,
  );
  assert(singleSentPenalty, "singleSentParaRatio penalty should fire");
  assert(singleSentPenalty.label.length > 0, "Penalty should have a human-readable label");
  assertEquals(singleSentPenalty.multiplier, 0.75);
});

Deno.test("scoring: 一文一段落比率が高くても文長SDが大きければ過多ペナルティは発火しない", () => {
  // 一文一段落は多い（比率 0.95）が、文の長短は豊か（SD 25 → 正規化 1.0）＝紋切りではない良作
  const raw = makeSyntheticMetrics({
    singleSentParaRatio: 0.95,
    sentenceLengthSD: 25,
  });
  const result = calculateScore(raw);

  const singleSentPenalty = result.penalties.find((p) => p.multiplier === 0.75);
  assertEquals(
    singleSentPenalty,
    undefined,
    "文長SDが大きければ一文一段落ペナルティは免除される",
  );
});

// --- 「地の文短行14 の過多」ペナルティ ---

const SHORT14_PENALTY_LABEL = "地の文短行14 の過多";

function makeCategory(overrides: Partial<CategoryCount> = {}): CategoryCount {
  return { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0, ...overrides };
}

function makeNarrative(overrides: Partial<NarrativeCount> = {}): NarrativeCount {
  return {
    lineCount: 0,
    charCount: 0,
    short14: 0,
    short20: 0,
    short30: 0,
    chunkCount: 0,
    shortChunk14: 0,
    shortChunk20: 0,
    shortChunk30: 0,
    ...overrides,
  };
}

function makeLineMetadata(narrative: Partial<NarrativeCount>): LineMetadata {
  return {
    totalLines: 100,
    totalChars: 3000,
    blankCount: 0,
    separatorCount: 0,
    narrative: makeNarrative(narrative),
    dialogue: makeCategory(),
    meta: makeCategory(),
    nonTerminal: makeCategory(),
  };
}

Deno.test("scoring: 地の文短行14 率が 30% を超えると新ペナルティが発火し ×0.85 が掛かる", () => {
  const raw = makeSyntheticMetrics();
  // 100 行中 31 行が 14 字未満 → 31%（30% 超え）
  const lineMeta = makeLineMetadata({ lineCount: 100, short14: 31 });
  const result = calculateScore(raw, lineMeta);

  const p = result.penalties.find((p) => p.label === SHORT14_PENALTY_LABEL);
  assert(p, "short14 penalty should fire when narrative short14 ratio exceeds 30%");
  assertEquals(p.multiplier, 0.85);
});

Deno.test("scoring: 地の文短行14 率がちょうど 30% では新ペナルティは発火しない（境界）", () => {
  const raw = makeSyntheticMetrics();
  // 100 行中 30 行が 14 字未満 → 30.0%（境界、非発火）
  const lineMeta = makeLineMetadata({ lineCount: 100, short14: 30 });
  const result = calculateScore(raw, lineMeta);

  const p = result.penalties.find((p) => p.label === SHORT14_PENALTY_LABEL);
  assertEquals(p, undefined, "30% ちょうどは strict > 30% を満たさないので発火しない");
});

Deno.test("scoring: lineMetadata を渡さない旧呼び出しでは新ペナルティは発火しない（後方互換）", () => {
  const raw = makeSyntheticMetrics();
  const result = calculateScore(raw); // lineMetadata 省略

  const p = result.penalties.find((p) => p.label === SHORT14_PENALTY_LABEL);
  assertEquals(p, undefined, "lineMetadata 未指定は新ペナルティの適用外");
});

Deno.test("scoring: narrative.lineCount === 0 では新ペナルティは発火しない（測定不能）", () => {
  const raw = makeSyntheticMetrics();
  // 地の文がゼロ行（会話劇 / 掲示板等）→ 短行率が定義できない
  const lineMeta = makeLineMetadata({ lineCount: 0, short14: 0 });
  const result = calculateScore(raw, lineMeta);

  const p = result.penalties.find((p) => p.label === SHORT14_PENALTY_LABEL);
  assertEquals(p, undefined, "lineCount=0 は測定不能で適用外（0 割回避）");
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
