import { assertEquals } from "@std/assert";
import type { RawMetrics } from "../../src/domain/types.ts";
import { calculateScore } from "../../src/domain/scoring/mod.ts";
import { METRIC_CONFIGS, PENALTY_RULES } from "../../src/domain/scoring/weights.ts";
import { scoreWithConfig } from "./score_experiment.ts";
import type { DatasetRecord } from "./dataset.ts";
import { CANONICAL_FORMULA, evaluateRecord, scoreResultFromMetrics } from "./cal_evaluate.ts";

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

Deno.test("evaluateRecord: 保存済み score を無視し rawMetrics から式で再計算する（化石化防止 C3）", () => {
  const r = raw();
  const poisoned = record(999, r); // 保存 score は rawMetrics と矛盾する毒値
  const result = evaluateRecord(poisoned, CANONICAL_FORMULA);
  assertEquals(result.score, calculateScore(r).score);
  assertEquals(result.score === 999, false);
});
