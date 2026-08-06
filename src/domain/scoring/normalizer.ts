import type { MetricResult, RawMetrics } from "../types.ts";
import { METRIC_CONFIGS } from "./weights.ts";

function formatReason(label: string, rawValue: number, invert: boolean, flagged: boolean): string {
  if (!flagged) return "";
  const direction = invert ? "高い" : "低い";
  const formatted = rawValue < 1 ? (rawValue * 100).toFixed(1) + "%" : rawValue.toFixed(1);
  return `${label}が ${formatted} と${direction}`;
}

export function normalizeMetrics(raw: RawMetrics): MetricResult[] {
  return METRIC_CONFIGS.map((config) => {
    const rawValue = raw[config.key as keyof RawMetrics] as number;
    const normalized = config.normalize(rawValue);
    const score = config.invert ? 1 - normalized : normalized;
    const contribution = score * config.weight * 100;
    const flagged = score < config.flagThreshold;

    return {
      key: config.key,
      label: config.label,
      rawValue,
      normalizedValue: score,
      weight: config.weight,
      contribution,
      flagged,
      reason: formatReason(config.label, rawValue, config.invert, flagged),
    };
  });
}
