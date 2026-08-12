import type { LineMetadata, MetricResult, RawMetrics } from "../types.ts";
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

// lineMetadata は deriveRawValue 定義済み指標 (narrativeCharPerLine 等) の派生元。
// 省略時はそれらの rawValue が 0 になる (deriveRawValue 側の契約)。
export function normalizeMetrics(raw: RawMetrics, lineMetadata?: LineMetadata): MetricResult[] {
  return METRIC_CONFIGS.map((config) => {
    // deriveRawValue 定義済みなら raw[key] の代わりにその返り値を rawValue として使う
    // (RawMetrics のキー参照では取れない lineMetadata 派生指標の weight 化)。
    const rawValue = config.deriveRawValue
      ? config.deriveRawValue(raw, lineMetadata)
      : (raw[config.key as keyof RawMetrics] as number);
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
