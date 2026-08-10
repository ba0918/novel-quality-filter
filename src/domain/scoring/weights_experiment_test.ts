import { assertEquals, assertNotEquals } from "@std/assert";
import type { RawMetrics } from "../types.ts";
import { METRIC_CONFIGS, PENALTY_RULES } from "./weights.ts";
import { EXPERIMENT_METRIC_CONFIGS, EXPERIMENT_PENALTY_RULES } from "./weights_experiment.ts";

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

Deno.test("weights_experiment: 実験式は正本と同じ指標キー集合を過不足なく持つ", () => {
  assertEquals(
    EXPERIMENT_METRIC_CONFIGS.map((c) => c.key).sort(),
    METRIC_CONFIGS.map((c) => c.key).sort(),
  );
});

Deno.test("weights_experiment: 実験式の採点は正本と差が出る（一覧の差分が識別力を持つ C2/C8）", () => {
  // 高比率×低SD＝一文一段落ペナルティ帯。実験式はここで正本と異なる点数を返す必要がある。
  const r = raw({ singleSentParaRatio: 0.85, sentenceLengthSD: 12 });
  const canonicalNorm = (key: string) => {
    const c = METRIC_CONFIGS.find((x) => x.key === key)!;
    const n = c.normalize(r[key as keyof RawMetrics] as number);
    return c.invert ? 1 - n : n;
  };
  const experimentNorm = (key: string) => {
    const c = EXPERIMENT_METRIC_CONFIGS.find((x) => x.key === key)!;
    const n = c.normalize(r[key as keyof RawMetrics] as number);
    return c.invert ? 1 - n : n;
  };
  // 一文一段落の寄与または合成ペナルティのいずれかで、正本と実験式は異なる挙動を示す。
  const contribDiffers = canonicalNorm("singleSentParaRatio") *
      METRIC_CONFIGS.find((c) => c.key === "singleSentParaRatio")!.weight !==
    experimentNorm("singleSentParaRatio") *
      EXPERIMENT_METRIC_CONFIGS.find((c) => c.key === "singleSentParaRatio")!.weight;
  const penaltyDiffers = assertHasDifferentCompositePenalty();
  assertEquals(contribDiffers || penaltyDiffers, true);
});

function assertHasDifferentCompositePenalty(): boolean {
  const canon = PENALTY_RULES.find((p) => p.label === "一文一段落の過多");
  const exp = EXPERIMENT_PENALTY_RULES.find((p) => p.label === "一文一段落の過多");
  return canon?.penaltyMultiplier !== exp?.penaltyMultiplier;
}

Deno.test("weights_experiment: 実験式を採点で使っても正本 weights.ts の値は不変（C1）", () => {
  const snapshot = (configs: typeof METRIC_CONFIGS) =>
    JSON.stringify(configs.map((c) => ({
      key: c.key,
      weight: c.weight,
      invert: c.invert,
      flagThreshold: c.flagThreshold,
    })));
  const canonicalSnapshot = snapshot(METRIC_CONFIGS);
  const penaltySnapshot = JSON.stringify(PENALTY_RULES);

  // 実験式を実際に採点へ流す（normalize を全指標に適用し、合成ペナルティ乗算まで通す）。
  const r = raw();
  let sum = 0;
  for (const c of EXPERIMENT_METRIC_CONFIGS) {
    const n = c.normalize(r[c.key as keyof RawMetrics] as number);
    sum += (c.invert ? 1 - n : n) * c.weight;
  }
  for (const p of EXPERIMENT_PENALTY_RULES) sum *= p.penaltyMultiplier;

  assertEquals(snapshot(METRIC_CONFIGS), canonicalSnapshot);
  assertEquals(JSON.stringify(PENALTY_RULES), penaltySnapshot);
  // 実験式は正本の M1 重みをそのまま流用していない（試行の器として機能している）。
  assertNotEquals(
    EXPERIMENT_METRIC_CONFIGS.find((c) => c.key === "singleSentParaRatio")!.weight,
    METRIC_CONFIGS.find((c) => c.key === "singleSentParaRatio")!.weight,
  );
});
