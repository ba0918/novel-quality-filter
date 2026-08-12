// 較正実験用のパラメータ化スコアラ。生指標 (RawMetrics) から、重み・正規化・ペナルティを
// 差し替えたスコアを再計算する。上書きなしは production の calculateScore と一致する（テストで固定）。
//
// 実装トラップ回避: M1 floor は「base の寄与」だけに効かせ、ペナルティ発火判定は常に canonical
// normalizedValue（floor 前）で行う。mod.ts のペナルティ条件が normalizedValue を読むため、
// floor を normalize 自体に焼くと一文一段落ルールが充足不能になり黙って永久不発になる。それを禁じる。

import type { RawMetrics } from "../../src/domain/types.ts";
import {
  CALIBRATION_CONTROL_POINTS,
  combinePenaltyMultipliers,
  METRIC_CONFIGS,
  type MetricConfig,
  PENALTY_RULES,
  type PenaltyRule,
} from "../../src/domain/scoring/weights.ts";
import { makeCalibration } from "../../src/domain/scoring/calibration.ts";

// mod.ts calculateScore と同一の較正段を通す（研究エンジンの baseline 忠実性）。
const calibrate = makeCalibration(CALIBRATION_CONTROL_POINTS);

// 任意の重み・正規化・ペナルティでスコアを再計算する研究エンジン。mod.ts / normalizer.ts と
// 同一の計算（normalize→invert→contribution 総和→clamp→ペナルティ乗算→round）を、設定を注入して行う。
// production の METRIC_CONFIGS / PENALTY_RULES を渡すと calculateScore と一致する（テストで固定）。
// 表示用の contribution-floor（scoreExperiment）と違い、正規化の変更はペナルティ発火判定にも波及する
// （＝gate スコアそのものを研究する用途。normalizedValue を条件に読むため本番と同じ挙動）。
export function scoreWithConfig(
  raw: RawMetrics,
  metricConfigs: MetricConfig[],
  penaltyRules: PenaltyRule[],
): number {
  const normOf = (key: string): number => {
    const c = metricConfigs.find((x) => x.key === key)!;
    // deriveRawValue 定義済み指標 (narrativeCharPerLine 等) は raw[key] に存在しない。
    // 本エンジンは lineMetadata を受け取らないため、派生値は「lineMetadata なし」契約の
    // 返り値 (=0) で評価する (calculateScore の lineMetadata 未指定時と同じ挙動)。
    const rawValue = c.deriveRawValue
      ? c.deriveRawValue(raw, undefined)
      : (raw[key as keyof RawMetrics] as number);
    const n = c.normalize(rawValue);
    return c.invert ? 1 - n : n;
  };

  let sum = 0;
  for (const c of metricConfigs) sum += normOf(c.key) * c.weight * 100;
  // mod.ts と同じ Σweight rescale (候補 D で weight 合計が 1.0 を超えたため)。
  const weightSum = metricConfigs.reduce((s, c) => s + c.weight, 0);
  const base = Math.max(0, Math.min(100, sum / weightSum));

  const firedMultipliers: number[] = [];
  for (const rule of penaltyRules) {
    // evaluate / grader ベースの rule は lineMetadata 派生値を条件に取るため、RawMetrics だけを
    // 扱う本研究エンジンのスコープ外。calculateScore が lineMetadata 未指定時に非発火と
    // 扱うのと同じ意味づけで、ここでは常に非発火として扱う（gate スコアの baseline 忠実性を保つ）。
    if (rule.evaluate || rule.graderMultiplier) continue;
    let met = true;
    for (const cond of rule.conditions) {
      const rv = raw[cond.key as keyof RawMetrics] as number;
      if (cond.exemptWhenZero && rv === 0) {
        met = false;
        break;
      }
      if (normOf(cond.key) >= cond.criticalThreshold) {
        met = false;
        break;
      }
    }
    if (met) firedMultipliers.push(rule.penaltyMultiplier);
  }
  // 案 A: mod.ts と同じ min-mult 合成。
  const mult = combinePenaltyMultipliers(firedMultipliers);
  const penalized = Math.max(0, Math.min(100, base * mult));
  return Math.round(calibrate(penalized));
}

export interface ExperimentConfig {
  m1ContribFloor?: number; // M1 の invert 済みスコアに掛ける下限（寄与のみ）
  m1Weight?: number; // M1 の重み上書き
  compositeMult?: number; // 「一文一段落の過多」ペナルティ乗算の上書き
}

const M1_KEY = "singleSentParaRatio";
const COMPOSITE_LABEL = "一文一段落の過多";

// 指標の canonical normalizedValue（invert 適用済み。normalizer.ts と同一）。
// 派生指標は lineMetadata なし契約の返り値 (=0) で評価する (scoreWithConfig と同じ)。
function normalizedValue(key: string, raw: RawMetrics): number {
  const c = METRIC_CONFIGS.find((x) => x.key === key)!;
  const rawValue = c.deriveRawValue
    ? c.deriveRawValue(raw, undefined)
    : (raw[key as keyof RawMetrics] as number);
  const n = c.normalize(rawValue);
  return c.invert ? 1 - n : n;
}

export function scoreExperiment(raw: RawMetrics, cfg: ExperimentConfig): number {
  let sum = 0;
  for (const c of METRIC_CONFIGS) {
    const nv = normalizedValue(c.key, raw);
    let contrib = nv;
    let weight = c.weight;
    if (c.key === M1_KEY) {
      if (cfg.m1ContribFloor != null) contrib = Math.max(cfg.m1ContribFloor, nv);
      if (cfg.m1Weight != null) weight = cfg.m1Weight;
    }
    sum += contrib * weight * 100;
  }
  // mod.ts と同じ Σweight rescale。m1Weight 上書き時はその上書き後の合計で正規化する
  // (重み変更実験でも常に 100 満点スケールを保つ)。
  let weightSum = 0;
  for (const c of METRIC_CONFIGS) {
    weightSum += c.key === M1_KEY && cfg.m1Weight != null ? cfg.m1Weight : c.weight;
  }
  const base = Math.max(0, Math.min(100, sum / weightSum));

  const firedMultipliers: number[] = [];
  for (const rule of PENALTY_RULES) {
    // scoreWithConfig と同じ理由で、evaluate / grader ベース rule は本エンジンでは常に非発火扱い
    // （lineMetadata を受け取れないため）。
    if (rule.evaluate || rule.graderMultiplier) continue;
    let met = true;
    for (const cond of rule.conditions) {
      const rv = raw[cond.key as keyof RawMetrics] as number;
      if (cond.exemptWhenZero && rv === 0) {
        met = false;
        break;
      }
      if (normalizedValue(cond.key, raw) >= cond.criticalThreshold) {
        met = false;
        break;
      }
    }
    if (met) {
      firedMultipliers.push(
        cfg.compositeMult != null && rule.label === COMPOSITE_LABEL
          ? cfg.compositeMult
          : rule.penaltyMultiplier,
      );
    }
  }
  // 案 A: mod.ts と同じ min-mult 合成。
  const mult = combinePenaltyMultipliers(firedMultipliers);
  const penalized = Math.max(0, Math.min(100, base * mult));
  return Math.round(calibrate(penalized));
}
