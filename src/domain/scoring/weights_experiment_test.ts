import { assertEquals } from "@std/assert";
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

// 較正ループの初期状態は「差分ゼロ」がベースライン ── 実験式は正本と同一値でスタートし、
// 実験デルタは brainstorm で仮説と根拠を議論してから明示的に入れる方針（weights_experiment.ts
// のコメント参照）。デルタを入れるとこの2本のテストが赤くなるので、その瞬間に「同時に
// テスト側の期待も更新する＝デルタ導入が可視化される」よう固定する。
Deno.test("weights_experiment: 初期状態は指標重み・normalize・flag・invert が正本と一致する（差分ゼロ）", () => {
  const shape = (cs: MetricConfig[]) =>
    cs.map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      invert: c.invert,
      flagThreshold: c.flagThreshold,
      // normalize 関数の同一性は 6 点サンプリングで代替（0/境界/中央/大値/負/整数）。
      normalizeSamples: [0, 0.01, 0.3, 0.7, 1, 12].map((x) => c.normalize(x)),
    }));
  assertEquals(shape(EXPERIMENT_METRIC_CONFIGS), shape(METRIC_CONFIGS));
});
type MetricConfig = typeof METRIC_CONFIGS[number];

Deno.test("weights_experiment: 初期状態はペナルティ規則が正本と一致する（差分ゼロ）", () => {
  assertEquals(
    JSON.stringify(EXPERIMENT_PENALTY_RULES),
    JSON.stringify(PENALTY_RULES),
  );
});

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
});
