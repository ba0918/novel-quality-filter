import type { LineMetadata, PenaltyResult, RawMetrics, ScoreResult } from "../types.ts";
import { normalizeMetrics } from "./normalizer.ts";
import { CALIBRATION_CONTROL_POINTS, PENALTY_RULES } from "./weights.ts";
import { makeCalibration } from "./calibration.ts";

// 較正関数はモジュールスコープで一度だけ構築する（PCHIP 傾きは制御点から決まる不変量）。
// 制御点は immutable 定数なので、都度 makeCalibration を呼ぶのは純粋な計算量の無駄。
const calibrate = makeCalibration(CALIBRATION_CONTROL_POINTS);

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

  // 集約段の 13 本目の normalize（表示較正カーブ）は round の直前・penalty 適用の直後に
  // 挟む。penalty 前に挟むと駄側の分布が動く（f が閾値 40 で固定でも中間帯が動くため）。
  // clamp を先に通してから f に渡し、f の出力を再 round する（f の入出力は [0, 100] に閉じる）。
  const penalized = Math.max(0, Math.min(100, baseScore * penaltyMultiplier));
  const score = Math.round(calibrate(penalized));
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
