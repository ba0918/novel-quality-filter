// 較正クロールのデータセット（JSONL）スキーマと入出力。collector と実験ハーネスで共有する。
// 生指標 (rawMetrics) を丸ごと保存するので、後段は任意の重み・正規化・ペナルティで再計算できる。

import type { LineMetadata, RawMetrics } from "../../src/domain/types.ts";

export interface DatasetRecord {
  workId: string;
  url: string;
  title: string;
  author: string;
  reviewCount: number;
  totalReviewPoint: number;
  totalCharacterCount: number;
  openingType: string;
  sampledCount: number;
  episodeUrl: string;
  score: number; // 現行設定での採点（参考。実験時は rawMetrics から再計算する）
  rawMetrics: RawMetrics;
  blankLineRatio: number; // 観測専用
  tags: string[]; // このクロールで踏んだシードタグ
  crawledAt: string; // ISO8601

  // --- 較正二段目（行メタ収集）で追加。旧レコード（108件・旧クロール）は欠損許容。 ---
  // 行メタの集計結果（分子・分母）。行メタ分析はこれを持つレコードだけを対象にする。
  lineMetadata?: LineMetadata;
  // 原本（capture_store）への参照。再フェッチなしの再導出はこの capture を読む。
  captureId?: string;
  // サイト接頭辞付きの作品キー（例 kakuyomu:123）。labels との join キー。
  siteWorkId?: string;
  // 採点対象本文の SHA-256。作者と併せて転載重複（同一本文の跨り）を検出する。
  bodyHash?: string;
  // 収集経路の由来マーカー（新形式は "collected"）。旧形式は欠損。
  eligibility?: string;
}

export function toJsonl(rec: DatasetRecord): string {
  return JSON.stringify(rec) + "\n";
}

export function parseJsonl(text: string): DatasetRecord[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as DatasetRecord);
}

export function seenWorkIds(records: DatasetRecord[]): Set<string> {
  return new Set(records.map((r) => r.workId));
}

export async function loadDataset(path: string): Promise<DatasetRecord[]> {
  try {
    return parseJsonl(await Deno.readTextFile(path));
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return [];
    throw e;
  }
}

export async function appendRecord(path: string, rec: DatasetRecord): Promise<void> {
  await Deno.writeTextFile(path, toJsonl(rec), { append: true });
}

export interface LabelRecord {
  workId: string;
  label: string; // 良 / ゴミ / 対象外 など
  note?: string;
}

export function parseLabels(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    const r = JSON.parse(line) as LabelRecord;
    map.set(r.workId, r.label);
  }
  return map;
}

export async function loadLabels(path: string): Promise<Map<string, string>> {
  try {
    return parseLabels(await Deno.readTextFile(path));
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return new Map();
    throw e;
  }
}
