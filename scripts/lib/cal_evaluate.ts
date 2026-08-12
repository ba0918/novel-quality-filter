// 較正ツールのスコア再計算の単一経路（formula drift 対策の核）。DatasetRecord.rawMetrics から、
// 引数で渡した式（正本 or 実験式）で ScoreResult をその場で計算し直す。収集時に保存した
// record.score は化石化するため一切使わない（評価・詳細・一覧はすべてここを通す）。
//
// 正本の採点経路（mod.ts / normalizer.ts）は凍結対象で書き換えられない。実験式は任意の
// MetricConfig[] / PenaltyRule[] を注入して採点する必要があるため、正本のロジックを import
// せずここで再実装する。正本の式を渡したとき ScoreResult 全体が calculateScore と一致すること、
// スカラーが score_experiment.scoreWithConfig と一致することをテストで固定し、二重実装のドリフトを禁じる。

import type {
  LineMetadata,
  MetricResult,
  OpeningFormat,
  PenaltyResult,
  RawMetrics,
  ScoreResult,
} from "../../src/domain/types.ts";
import {
  CALIBRATION_CONTROL_POINTS,
  combinePenaltyMultipliers,
  METRIC_CONFIGS,
  type MetricConfig,
  PENALTY_RULES,
  type PenaltyRule,
} from "../../src/domain/scoring/weights.ts";
import {
  EXPERIMENT_METRIC_CONFIGS,
  EXPERIMENT_PENALTY_RULES,
} from "../../src/domain/scoring/weights_experiment.ts";
import { makeCalibration } from "../../src/domain/scoring/calibration.ts";
import type { DatasetRecord } from "./dataset.ts";

// 較正関数はモジュールスコープで一度だけ構築する。canonical / experiment とも同じ
// 制御点を共有する設計（指標側の実験と較正側の実験を分離する）。
const calibrate = makeCalibration(CALIBRATION_CONTROL_POINTS);

export interface Formula {
  metricConfigs: MetricConfig[];
  penaltyRules: PenaltyRule[];
}

export const CANONICAL_FORMULA: Formula = {
  metricConfigs: METRIC_CONFIGS,
  penaltyRules: PENALTY_RULES,
};

export const EXPERIMENT_FORMULA: Formula = {
  metricConfigs: EXPERIMENT_METRIC_CONFIGS,
  penaltyRules: EXPERIMENT_PENALTY_RULES,
};

export type FormulaName = "canonical" | "experiment";

export function pickFormula(name: FormulaName): Formula {
  return name === "experiment" ? EXPERIMENT_FORMULA : CANONICAL_FORMULA;
}

// normalizer.ts の reason 文面と一致させる（ScoreResult 全体の一致テストが要求する）。
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

function normalizeWith(
  raw: RawMetrics,
  configs: MetricConfig[],
  lineMetadata?: LineMetadata,
): MetricResult[] {
  return configs.map((config) => {
    // deriveRawValue 定義済みなら raw[key] の代わりにその返り値を rawValue として使う。
    // 例: narrativeShort14Ratio を lineMetadata から派生させて weight 化する実験。
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

// mod.ts calculateScore と同じ計算を、任意の式を注入して行う。ペナルティ発火判定は注入後の
// normalizedValue で行う（scoreWithConfig と同セマンティクス。正規化の変更が発火に波及する）。
// lineMetadata は省略可能。省略時は evaluate ベース rule が常に非発火（calculateScore と同挙動）。
export function scoreResultFromMetrics(
  raw: RawMetrics,
  formula: Formula,
  lineMetadata?: LineMetadata,
): ScoreResult {
  const metrics = normalizeWith(raw, formula.metricConfigs, lineMetadata);
  const rawScore = metrics.reduce((sum, m) => sum + m.contribution, 0);
  // mod.ts と同じ Σweight rescale (候補 D で weight 合計が 1.0 を超えたため)。式ごとの
  // 合計から導出するので、weight 合計の異なる実験式を注入しても常に 100 満点に正規化される。
  const weightSum = formula.metricConfigs.reduce((sum, c) => sum + c.weight, 0);
  const baseScore = Math.max(0, Math.min(100, rawScore / weightSum));

  const penalties: PenaltyResult[] = [];
  const firedMultipliers: number[] = [];
  for (const rule of formula.penaltyRules) {
    // mod.ts と同じ 3 系統排他 (grader / evaluate / conditions)。
    if (rule.graderMultiplier) {
      const multiplier = rule.graderMultiplier(raw, lineMetadata);
      if (multiplier < 1.0) {
        firedMultipliers.push(multiplier);
        penalties.push({ label: rule.label, multiplier });
      }
      continue;
    }
    const fires = rule.evaluate
      ? rule.evaluate(raw, lineMetadata)
      : matchesConditionsFor(rule, raw, metrics);
    if (fires) {
      firedMultipliers.push(rule.penaltyMultiplier);
      penalties.push({ label: rule.label, multiplier: rule.penaltyMultiplier });
    }
  }
  // 案 A: mod.ts と同じ min-mult 合成 (weights.ts の combinePenaltyMultipliers 参照)。
  const penaltyMultiplier = combinePenaltyMultipliers(firedMultipliers);

  // mod.ts calculateScore と同一の較正段（集約段の 13 本目の normalize）を通す。
  // canonical/experiment 両方に同じ f を掛けることで、指標側の実験と較正側の実験を分離する。
  const penalized = Math.max(0, Math.min(100, baseScore * penaltyMultiplier));
  const score = Math.round(calibrate(penalized));
  return { score, metrics, penalties };
}

function matchesConditionsFor(
  rule: PenaltyRule,
  raw: RawMetrics,
  metrics: MetricResult[],
): boolean {
  for (const cond of rule.conditions) {
    const rawValue = raw[cond.key as keyof RawMetrics] as number;
    if (cond.exemptWhenZero && rawValue === 0) return false;
    const m = metrics.find((m) => m.key === cond.key);
    if (!m || m.normalizedValue >= cond.criticalThreshold) return false;
  }
  return true;
}

const OPENING_FORMATS: OpeningFormat[] = [
  "normal",
  "character-intro",
  "bulletin-board",
  "too-short",
];

// DatasetRecord.openingType は string 保存なので、既知の OpeningFormat のときだけ narrow する
// （未知値は undefined として扱い、キャストで型を偽装しない）。
function asOpeningFormat(value: string): OpeningFormat | undefined {
  return OPENING_FORMATS.includes(value as OpeningFormat) ? (value as OpeningFormat) : undefined;
}

// 1レコードを式で採点し、詳細票が要る診断メタ（開幕文脈・行メタ）を添えた ScoreResult を返す。
// record.lineMetadata は「地の文短行14 の過多」ペナルティの入力として scoreResultFromMetrics に
// 渡す（無ければ evaluate 側で非発火扱い）。
export function evaluateRecord(record: DatasetRecord, formula: Formula): ScoreResult {
  const base = scoreResultFromMetrics(record.rawMetrics, formula, record.lineMetadata);
  return {
    ...base,
    openingType: asOpeningFormat(record.openingType),
    sampledCount: record.sampledCount,
    lineMetadata: record.lineMetadata,
  };
}
