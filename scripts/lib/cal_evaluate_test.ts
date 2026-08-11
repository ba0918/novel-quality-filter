import { assert, assertEquals } from "@std/assert";
import type {
  CategoryCount,
  LineMetadata,
  NarrativeCount,
  RawMetrics,
} from "../../src/domain/types.ts";
import { calculateScore } from "../../src/domain/scoring/mod.ts";
import { METRIC_CONFIGS, PENALTY_RULES } from "../../src/domain/scoring/weights.ts";
import { scoreWithConfig } from "./score_experiment.ts";
import type { DatasetRecord } from "./dataset.ts";
import {
  CANONICAL_FORMULA,
  evaluateRecord,
  EXPERIMENT_FORMULA,
  pickFormula,
  scoreResultFromMetrics,
} from "./cal_evaluate.ts";

function raw(overrides: Partial<RawMetrics> = {}): RawMetrics {
  return {
    charCount: 3000,
    sentenceCount: 60,
    sentenceLengthSD: 12,
    singleSentParaRatio: 0.85,
    paragraphLengthSD: 20,
    separatorCount: 0,
    separatorFrequency: 0,
    ttr: 0.5,
    dialogueCount: 20,
    dialogueEndingVariety: 0.5,
    descriptionDensitySD: 0.03,
    taigendomeEntropy: 1,
    emotionDirectnessRatio: 0.04,
    logicalConnectiveDensity: 0.1,
    paragraphTransitionEntropy: 1,
    sentenceLengthBurstiness: 5,
    ...overrides,
  };
}

const SAMPLES = [
  raw(),
  raw({ singleSentParaRatio: 0.3, sentenceLengthSD: 25 }),
  raw({ sentenceLengthSD: 8, sentenceLengthBurstiness: 2 }),
  raw({ sentenceLengthBurstiness: 0 }),
];

Deno.test("scoreResultFromMetrics: 正本の式を渡すと calculateScore と ScoreResult 全体が一致する", () => {
  for (const r of SAMPLES) {
    assertEquals(scoreResultFromMetrics(r, CANONICAL_FORMULA), calculateScore(r));
  }
});

Deno.test("scoreResultFromMetrics: スカラーは score_experiment の scoreWithConfig と一致する（再利用の錨）", () => {
  for (const r of SAMPLES) {
    assertEquals(
      scoreResultFromMetrics(r, CANONICAL_FORMULA).score,
      scoreWithConfig(r, METRIC_CONFIGS, PENALTY_RULES),
    );
  }
});

Deno.test("scoreResultFromMetrics: 正規化変更はペナルティ発火判定に波及する（scoreWithConfig と同セマンティクス）", () => {
  const r = raw({ singleSentParaRatio: 0.85, sentenceLengthSD: 12 });
  const flooredConfigs = METRIC_CONFIGS.map((c) =>
    c.key === "singleSentParaRatio"
      ? { ...c, normalize: (v: number) => Math.min(Math.max(1 - Math.min(v, 1), 0.35), 1) }
      : c
  );
  const formula = { metricConfigs: flooredConfigs, penaltyRules: PENALTY_RULES };
  assertEquals(
    scoreResultFromMetrics(r, formula).score,
    scoreWithConfig(r, flooredConfigs, PENALTY_RULES),
  );
});

function record(score: number, rawMetrics: RawMetrics): DatasetRecord {
  return {
    workId: "1",
    url: "https://kakuyomu.jp/works/1",
    title: "t",
    author: "a",
    reviewCount: 0,
    totalReviewPoint: 0,
    totalCharacterCount: 0,
    openingType: "normal",
    sampledCount: 1,
    episodeUrl: "https://kakuyomu.jp/works/1/episodes/1",
    score,
    rawMetrics,
    blankLineRatio: 0,
    tags: [],
    crawledAt: "2026-01-01T00:00:00.000Z",
  };
}

Deno.test("pickFormula: 名前で正本/実験式を選び分ける", () => {
  assertEquals(pickFormula("canonical"), CANONICAL_FORMULA);
  assertEquals(pickFormula("experiment"), EXPERIMENT_FORMULA);
});

Deno.test("evaluateRecord: 保存済み score を無視し rawMetrics から式で再計算する（化石化防止 C3）", () => {
  const r = raw();
  const poisoned = record(999, r); // 保存 score は rawMetrics と矛盾する毒値
  const result = evaluateRecord(poisoned, CANONICAL_FORMULA);
  assertEquals(result.score, calculateScore(r).score);
  assertEquals(result.score === 999, false);
});

// --- lineMetadata を渡す経路の固定 ---

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

Deno.test(
  "evaluateRecord: record.lineMetadata を calculateScore に渡し、新ペナルティが反映される",
  () => {
    const r = raw();
    // 100 行中 40 行が 14 字未満 → 40% > 30% で新ペナルティが発火する
    const firingMeta = makeLineMetadata({ lineCount: 100, short14: 40 });
    const rec: DatasetRecord = { ...record(0, r), lineMetadata: firingMeta };
    const result = evaluateRecord(rec, CANONICAL_FORMULA);
    const short14Penalty = result.penalties.find((p) => p.label === "地の文短行14 の過多");
    assert(short14Penalty, "record.lineMetadata が calculateScore に渡っていない");
    assertEquals(short14Penalty.multiplier, 0.85);
    // 新ペナルティ発火時のスコアは、渡さない場合より低い
    const scoreNoMeta = calculateScore(r).score;
    if (!(result.score < scoreNoMeta)) {
      throw new Error(
        `短行14 発火時は score が下がるはず: no-meta=${scoreNoMeta} with-meta=${result.score}`,
      );
    }
  },
);

Deno.test(
  "evaluateRecord: record.lineMetadata が undefined なら新ペナルティは発火しない（適用外）",
  () => {
    const r = raw();
    const rec = record(0, r); // lineMetadata は undefined
    const result = evaluateRecord(rec, CANONICAL_FORMULA);
    const short14Penalty = result.penalties.find((p) => p.label === "地の文短行14 の過多");
    assertEquals(short14Penalty, undefined);
  },
);
