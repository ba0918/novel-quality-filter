import type { LineMetadata, PenaltyResult, RawMetrics, ScoreResult } from "../types.ts";
import { normalizeMetrics } from "./normalizer.ts";
import { PENALTY_RULES } from "./weights.ts";

// lineMetadata は省略可能。省略時は「短行14 の過多」のように lineMetadata を要する rule は
// evaluate 内部で false を返して非発火となる。旧呼び出し形式との後方互換を保つための設計。
export function calculateScore(
  rawMetrics: RawMetrics,
  lineMetadata?: LineMetadata,
): ScoreResult {
  const metrics = normalizeMetrics(rawMetrics);
  const rawScore = metrics.reduce((sum, m) => sum + m.contribution, 0);
  const baseScore = Math.max(0, Math.min(100, rawScore));

  let penaltyMultiplier = 1.0;
  const penalties: PenaltyResult[] = [];

  for (const rule of PENALTY_RULES) {
    // evaluate 定義済み rule は関数側で発火判定する（lineMetadata 派生値を条件に取れる）。
    // conditions ベースの既存 rule は RawMetrics 正規化値だけで判定する。両者は排他。
    const fires = rule.evaluate
      ? rule.evaluate(rawMetrics, lineMetadata)
      : matchesConditions(rule.conditions, rawMetrics, metrics);
    if (fires) {
      penaltyMultiplier *= rule.penaltyMultiplier;
      penalties.push({ label: rule.label, multiplier: rule.penaltyMultiplier });
    }
  }

  const score = Math.round(baseScore * penaltyMultiplier);
  return { score, metrics, penalties };
}

function matchesConditions(
  conditions: import("./weights.ts").PenaltyCondition[],
  rawMetrics: RawMetrics,
  metrics: import("../types.ts").MetricResult[],
): boolean {
  for (const cond of conditions) {
    const rawValue = rawMetrics[cond.key as keyof RawMetrics] as number;
    if (cond.exemptWhenZero && rawValue === 0) return false;
    const m = metrics.find((m) => m.key === cond.key);
    if (!m || m.normalizedValue >= cond.criticalThreshold) return false;
  }
  return true;
}

export { normalizeMetrics } from "./normalizer.ts";
export { DEFAULT_THRESHOLD, METRIC_CONFIGS } from "./weights.ts";
