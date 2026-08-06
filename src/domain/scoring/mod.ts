import type { RawMetrics, ScoreResult } from "../types.ts";
import { normalizeMetrics } from "./normalizer.ts";

export function calculateScore(rawMetrics: RawMetrics): ScoreResult {
  const metrics = normalizeMetrics(rawMetrics);
  const rawScore = metrics.reduce((sum, m) => sum + m.contribution, 0);
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));
  return { score, metrics };
}

export { normalizeMetrics } from "./normalizer.ts";
export { DEFAULT_THRESHOLD, METRIC_CONFIGS } from "./weights.ts";
