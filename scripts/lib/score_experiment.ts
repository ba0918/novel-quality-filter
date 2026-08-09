// 較正実験用のパラメータ化スコアラ。生指標 (RawMetrics) から、重み・正規化・ペナルティを
// 差し替えたスコアを再計算する。上書きなしは production の calculateScore と一致する（テストで固定）。
//
// 実装トラップ回避: M1 floor は「base の寄与」だけに効かせ、ペナルティ発火判定は常に canonical
// normalizedValue（floor 前）で行う。mod.ts のペナルティ条件が normalizedValue を読むため、
// floor を normalize 自体に焼くと一文一段落ルールが充足不能になり黙って永久不発になる。それを禁じる。

import type { RawMetrics } from "../../src/domain/types.ts";
import { METRIC_CONFIGS, PENALTY_RULES } from "../../src/domain/scoring/weights.ts";

export interface ExperimentConfig {
  m1ContribFloor?: number; // M1 の invert 済みスコアに掛ける下限（寄与のみ）
  m1Weight?: number; // M1 の重み上書き
  compositeMult?: number; // 「一文一段落の過多」ペナルティ乗算の上書き
}

const M1_KEY = "singleSentParaRatio";
const COMPOSITE_LABEL = "一文一段落の過多";

// 指標の canonical normalizedValue（invert 適用済み。normalizer.ts と同一）。
function normalizedValue(key: string, raw: RawMetrics): number {
  const c = METRIC_CONFIGS.find((x) => x.key === key)!;
  const n = c.normalize(raw[key as keyof RawMetrics] as number);
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
  const base = Math.max(0, Math.min(100, sum));

  let mult = 1;
  for (const rule of PENALTY_RULES) {
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
      mult *= cfg.compositeMult != null && rule.label === COMPOSITE_LABEL
        ? cfg.compositeMult
        : rule.penaltyMultiplier;
    }
  }
  return Math.round(base * mult);
}
