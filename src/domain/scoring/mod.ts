import type { RawMetrics, ScoreResult } from "../types.ts";
import { normalizeMetrics } from "./normalizer.ts";
import { PENALTY_RULES } from "./weights.ts";

export function calculateScore(rawMetrics: RawMetrics): ScoreResult {
  const metrics = normalizeMetrics(rawMetrics);
  const rawScore = metrics.reduce((sum, m) => sum + m.contribution, 0);
  const baseScore = Math.max(0, Math.min(100, rawScore));

  let penaltyMultiplier = 1.0;
  for (const rule of PENALTY_RULES) {
    let allConditionsMet = true;
    for (const cond of rule.conditions) {
      const rawValue = rawMetrics[cond.key as keyof RawMetrics] as number;
      if (cond.exemptWhenZero && rawValue === 0) {
        allConditionsMet = false;
        break;
      }
      const m = metrics.find((m) => m.key === cond.key);
      if (!m || m.normalizedValue >= cond.criticalThreshold) {
        allConditionsMet = false;
        break;
      }
    }
    if (allConditionsMet) {
      penaltyMultiplier *= rule.penaltyMultiplier;
    }
  }

  const score = Math.round(baseScore * penaltyMultiplier);
  return { score, metrics };
}

export { normalizeMetrics } from "./normalizer.ts";
export { DEFAULT_THRESHOLD, METRIC_CONFIGS } from "./weights.ts";
