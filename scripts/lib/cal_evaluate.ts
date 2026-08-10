// 較正ツールのスコア再計算の単一経路（formula drift 対策の核）。DatasetRecord.rawMetrics から、
// 引数で渡した式（正本 or 実験式）で ScoreResult をその場で計算し直す。収集時に保存した
// record.score は化石化するため一切使わない（評価・詳細・一覧はすべてここを通す）。
//
// 正本の採点経路（mod.ts / normalizer.ts）は凍結対象で書き換えられない。実験式は任意の
// MetricConfig[] / PenaltyRule[] を注入して採点する必要があるため、正本のロジックを import
// せずここで再実装する。正本の式を渡したとき ScoreResult 全体が calculateScore と一致すること、
// スカラーが score_experiment.scoreWithConfig と一致することをテストで固定し、二重実装のドリフトを禁じる。

import type {
  MetricResult,
  OpeningFormat,
  PenaltyResult,
  RawMetrics,
  ScoreResult,
} from "../../src/domain/types.ts";
import {
  METRIC_CONFIGS,
  type MetricConfig,
  PENALTY_RULES,
  type PenaltyRule,
} from "../../src/domain/scoring/weights.ts";
import type { DatasetRecord } from "./dataset.ts";

export interface Formula {
  metricConfigs: MetricConfig[];
  penaltyRules: PenaltyRule[];
}

export const CANONICAL_FORMULA: Formula = {
  metricConfigs: METRIC_CONFIGS,
  penaltyRules: PENALTY_RULES,
};

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

function normalizeWith(raw: RawMetrics, configs: MetricConfig[]): MetricResult[] {
  return configs.map((config) => {
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

// mod.ts calculateScore と同じ計算を、任意の式を注入して行う。ペナルティ発火判定は注入後の
// normalizedValue で行う（scoreWithConfig と同セマンティクス。正規化の変更が発火に波及する）。
export function scoreResultFromMetrics(raw: RawMetrics, formula: Formula): ScoreResult {
  const metrics = normalizeWith(raw, formula.metricConfigs);
  const rawScore = metrics.reduce((sum, m) => sum + m.contribution, 0);
  const baseScore = Math.max(0, Math.min(100, rawScore));

  let penaltyMultiplier = 1.0;
  const penalties: PenaltyResult[] = [];
  for (const rule of formula.penaltyRules) {
    let allConditionsMet = true;
    for (const cond of rule.conditions) {
      const rawValue = raw[cond.key as keyof RawMetrics] as number;
      if (cond.exemptWhenZero && rawValue === 0) {
        allConditionsMet = false;
        break;
      }
      const m = metrics.find((m) => m.key === cond.key);
      if (!m || m.normalizedValue >= cond.criticalThreshold) {
        allConditionsMet = false;
        break;
      }
    }
    if (allConditionsMet) {
      penaltyMultiplier *= rule.penaltyMultiplier;
      penalties.push({ label: rule.label, multiplier: rule.penaltyMultiplier });
    }
  }

  const score = Math.round(baseScore * penaltyMultiplier);
  return { score, metrics, penalties };
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
export function evaluateRecord(record: DatasetRecord, formula: Formula): ScoreResult {
  const base = scoreResultFromMetrics(record.rawMetrics, formula);
  return {
    ...base,
    openingType: asOpeningFormat(record.openingType),
    sampledCount: record.sampledCount,
    lineMetadata: record.lineMetadata,
  };
}
