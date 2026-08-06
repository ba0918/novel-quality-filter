import type { RawMetrics, ScoreResult } from "../types.ts";
import { normalizeMetrics } from "./normalizer.ts";
import { PENALTY_RULES } from "./weights.ts";

export function calculateScore(rawMetrics: RawMetrics): ScoreResult {
  const metrics = normalizeMetrics(rawMetrics);
  const rawScore = metrics.reduce((sum, m) => sum + m.contribution, 0);
  const baseScore = Math.max(0, Math.min(100, rawScore));

  let penaltyMultiplier = 1.0;
  for (const rule of PENALTY_RULES) {
    const rawValue = rawMetrics[rule.key as keyof RawMetrics] as number;
    if (rule.exemptWhenZero && rawValue === 0) continue;
    const m = metrics.find((m) => m.key === rule.key);
    if (m && m.normalizedValue < rule.criticalThreshold) {
      penaltyMultiplier *= rule.penaltyMultiplier;
    }
  }

  const score = Math.round(baseScore * penaltyMultiplier);
  return { score, metrics };
}

export { normalizeMetrics } from "./normalizer.ts";
export { DEFAULT_THRESHOLD, METRIC_CONFIGS } from "./weights.ts";
