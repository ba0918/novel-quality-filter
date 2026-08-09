// 行メタ3指標 × 品質ラベルの分離度と、現行スコア×ユーザー判定の食い違いを出す分析コア。
// 対象外・論理除外・旧形式（行メタ欠損）は分離計算から外し、外した件数を必ず報告する
// （暗黙の間引き禁止）。アンカーと広域で同一作者・同一bodyHashが跨る場合は交絡/リークとして警告する。

import type { LineMetadata } from "../../src/domain/types.ts";
import type { DatasetRecord } from "./dataset.ts";
import { siteWorkId as makeSiteWorkId } from "./capture_store.ts";
import { deriveLineMetrics } from "./line_metrics.ts";
import type { LabelRecord2 } from "./labels_store.ts";

const METRIC_KEYS = ["avgCharsPerLine", "narrativeShortLineRatio30", "metaRatio"] as const;
type MetricKey = typeof METRIC_KEYS[number];

export interface JoinedRecord {
  record: DatasetRecord;
  label?: LabelRecord2;
}

export interface MetricSeparation {
  key: MetricKey;
  goodMean: number;
  junkMean: number;
  gap: number; // goodMean - junkMean（符号付き。方向の解釈は読み手に委ねる）
}

export interface LeakWarning {
  kind: "author" | "bodyHash";
  value: string;
  works: string[];
}

export interface SeparationReport {
  eligibleCount: number;
  goodCount: number;
  junkCount: number;
  legacyExcludedCount: number;
  scopeExcludedCount: number;
  logicallyExcludedCount: number;
  metrics: MetricSeparation[];
  mismatches: { passedJunk: JoinedRecord[]; caughtGood: JoinedRecord[] };
  leakage: LeakWarning[];
}

export function joinLabels(records: DatasetRecord[], labels: LabelRecord2[]): JoinedRecord[] {
  const byId = new Map(labels.map((l) => [l.siteWorkId, l]));
  return dedupeByWork(records).map((record) => ({ record, label: byId.get(keyOf(record)) }));
}

// 同一作品の重複レコード（--recapture で追記された別スナップショット）は最新1件に畳む。
// 追記順＝取得順なので後勝ちで最新を残す。1作品1票にして分離度の二重計上を防ぐ。
function dedupeByWork(records: DatasetRecord[]): DatasetRecord[] {
  const byId = new Map<string, DatasetRecord>();
  for (const r of records) byId.set(keyOf(r), r);
  return [...byId.values()];
}

export function analyzeSeparation(
  records: DatasetRecord[],
  labels: LabelRecord2[],
  threshold: number,
): SeparationReport {
  const joined = joinLabels(records, labels);

  const good: JoinedRecord[] = [];
  const junk: JoinedRecord[] = [];
  let legacyExcludedCount = 0;
  let scopeExcludedCount = 0;
  let logicallyExcludedCount = 0;

  for (const j of joined) {
    if (!j.label) continue; // ラベルなし（広域）は分離対象でない
    // スコープ外を最優先で除外する（対象外を良/ゴミの分離度計算に混ぜない、C6）。
    if (j.label.scope === "対象外") {
      scopeExcludedCount++;
      continue;
    }
    if (j.record.lineMetadata === undefined) {
      legacyExcludedCount++; // 旧形式は行メタが無いので分離不能
      continue;
    }
    if (j.label.excluded) {
      logicallyExcludedCount++;
      continue;
    }
    if (j.label.quality === "良") good.push(j);
    else if (j.label.quality === "ゴミ") junk.push(j);
  }

  return {
    eligibleCount: good.length + junk.length,
    goodCount: good.length,
    junkCount: junk.length,
    legacyExcludedCount,
    scopeExcludedCount,
    logicallyExcludedCount,
    metrics: METRIC_KEYS.map((key) => separationOf(key, good, junk)),
    mismatches: findMismatches(joined, threshold),
    leakage: leakageWarnings(joined),
  };
}

function separationOf(
  key: MetricKey,
  good: JoinedRecord[],
  junk: JoinedRecord[],
): MetricSeparation {
  const goodMean = mean(good.map((j) => metric(j.record.lineMetadata!, key)));
  const junkMean = mean(junk.map((j) => metric(j.record.lineMetadata!, key)));
  return { key, goodMean, junkMean, gap: goodMean - junkMean };
}

function metric(meta: LineMetadata, key: MetricKey): number {
  return deriveLineMetrics(meta)[key];
}

// 現行スコアとユーザー判定の食い違い。対象外・論理除外は判定対象から外す。
function findMismatches(joined: JoinedRecord[], threshold: number) {
  const judged = joined.filter((j) =>
    j.label?.quality !== undefined && !j.label.excluded && j.label.scope !== "対象外"
  );
  return {
    // 通過駄文: 現行スコアで通過しているのにユーザーはゴミ判定。
    passedJunk: judged.filter((j) => j.record.score > threshold && j.label!.quality === "ゴミ"),
    // 巻き込み良作: 現行スコアで除外されるのにユーザーは良判定。
    caughtGood: judged.filter((j) => j.record.score <= threshold && j.label!.quality === "良"),
  };
}

// 同一作者・同一bodyHash が複数作品に跨り、かつ少なくとも1件がアンカー（ラベルあり）である場合に
// 警告する。分離がアンカー↔広域のリーク（作者・シリーズ・転載重複）由来でないか監視するため。
function leakageWarnings(joined: JoinedRecord[]): LeakWarning[] {
  return [
    ...groupWarnings("author", joined, (j) => j.record.author),
    ...groupWarnings("bodyHash", joined, (j) => j.record.bodyHash),
  ];
}

function groupWarnings(
  kind: "author" | "bodyHash",
  joined: JoinedRecord[],
  keyFn: (j: JoinedRecord) => string | undefined,
): LeakWarning[] {
  const groups = new Map<string, { works: Set<string>; hasAnchor: boolean }>();
  for (const j of joined) {
    const value = keyFn(j);
    if (!value) continue;
    const g = groups.get(value) ?? { works: new Set(), hasAnchor: false };
    g.works.add(keyOf(j.record));
    if (j.label?.quality !== undefined) g.hasAnchor = true;
    groups.set(value, g);
  }
  const warnings: LeakWarning[] = [];
  for (const [value, g] of groups) {
    if (g.works.size >= 2 && g.hasAnchor) {
      warnings.push({ kind, value, works: [...g.works] });
    }
  }
  return warnings;
}

function keyOf(record: DatasetRecord): string {
  return record.siteWorkId ?? makeSiteWorkId("kakuyomu", record.workId);
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
