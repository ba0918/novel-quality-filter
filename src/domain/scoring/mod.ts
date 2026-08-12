import type { LineMetadata, PenaltyResult, RawMetrics, ScoreResult } from "../types.ts";
import { normalizeMetrics } from "./normalizer.ts";
import {
  CALIBRATION_CONTROL_POINTS,
  combinePenaltyMultipliers,
  METRIC_CONFIGS,
  PENALTY_RULES,
} from "./weights.ts";
import { makeCalibration } from "./calibration.ts";

// 較正関数はモジュールスコープで一度だけ構築する（PCHIP 傾きは制御点から決まる不変量）。
// 制御点は immutable 定数なので、都度 makeCalibration を呼ぶのは純粋な計算量の無駄。
const calibrate = makeCalibration(CALIBRATION_CONTROL_POINTS);

// base 合計の rescale 係数。候補 D で weight 合計が 1.0 を超えた (narrativeCharPerLine 追加、
// 既存 weight の按分はしない方針) ため、Σweight で割って 100 満点を維持する。
// 定数 1.15 を直書きせず Σweight から導出する: 将来 weight を足すときも「合計を増やして
// rescale」の不変量が式のまま保たれ、定数と実合計のズレ事故が起きない。
const WEIGHT_SUM = METRIC_CONFIGS.reduce((sum, c) => sum + c.weight, 0);

// lineMetadata は省略可能。省略時は「短行14 の過多」のように lineMetadata を要する rule は
// evaluate 内部で false を返して非発火となる。旧呼び出し形式との後方互換を保つための設計。
export function calculateScore(
  rawMetrics: RawMetrics,
  lineMetadata?: LineMetadata,
): ScoreResult {
  const metrics = normalizeMetrics(rawMetrics, lineMetadata);
  const rawScore = metrics.reduce((sum, m) => sum + m.contribution, 0);
  const baseScore = Math.max(0, Math.min(100, rawScore / WEIGHT_SUM));

  const penalties: PenaltyResult[] = [];
  const firedMultipliers: number[] = [];

  for (const rule of PENALTY_RULES) {
    // 3 系統排他 (weights.ts の PenaltyRule コメント参照):
    // grader は連続 multiplier を返す (1.0 = 非発火)。evaluate / conditions は on/off で
    // penaltyMultiplier を適用する。
    if (rule.graderMultiplier) {
      const multiplier = rule.graderMultiplier(rawMetrics, lineMetadata);
      if (multiplier < 1.0) {
        firedMultipliers.push(multiplier);
        penalties.push({ label: rule.label, multiplier });
      }
      continue;
    }
    const fires = rule.evaluate
      ? rule.evaluate(rawMetrics, lineMetadata)
      : matchesConditions(rule.conditions, rawMetrics, metrics);
    if (fires) {
      firedMultipliers.push(rule.penaltyMultiplier);
      penalties.push({ label: rule.label, multiplier: rule.penaltyMultiplier });
    }
  }

  // 案 A: 乗算合成から min-mult 合成へ (weights.ts の combinePenaltyMultipliers コメント参照)。
  // penalties 配列自体は「発火した個々の rule」を記録し続ける (UI 側で発火理由を表示するため)。
  // baseScore に掛かる実効 multiplier だけを min にする設計。
  const penaltyMultiplier = combinePenaltyMultipliers(firedMultipliers);

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
