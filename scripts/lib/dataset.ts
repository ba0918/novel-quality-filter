// 較正クロールのデータセット（JSONL）スキーマと入出力。collector と実験ハーネスで共有する。
// 生指標 (rawMetrics) を丸ごと保存するので、後段は任意の重み・正規化・ペナルティで再計算できる。

import type { RawMetrics } from "../../src/domain/types.ts";

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
