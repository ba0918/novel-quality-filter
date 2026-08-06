import type { MetricResult, RawMetrics } from "../types.ts";
import { METRIC_CONFIGS } from "./weights.ts";

const CUSTOM_REASONS: Record<string, (rawValue: number) => string> = {
  sentenceLengthBurstiness: (raw) => `文章の緩急が乏しい（バースティネス ${raw.toFixed(1)}）`,
};

function formatReason(
  key: string,
  label: string,
  rawValue: number,
  invert: boolean,
  flagged: boolean,
): string {
  if (!flagged) return "";
  if (CUSTOM_REASONS[key]) return CUSTOM_REASONS[key](rawValue);
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
      reason: formatReason(config.key, config.label, rawValue, config.invert, flagged),
    };
  });
}
