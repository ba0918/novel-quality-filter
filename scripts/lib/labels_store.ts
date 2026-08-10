// ラベルストア（labels.jsonl）。ユーザーの主観判定を2軸（品質: 良/駄、スコープ: 対象/対象外）＋
// コホートタグ＋論理除外フラグで持つ。1作品1行・last-write-wins。手JSON編集を避け、label/tag/
// exclude の各 CLI から純関数で更新する。join キーは siteWorkId（例 kakuyomu:123）。

import { parseTargetUrl } from "../../src/background/fetchers/kakuyomu.ts";
import { siteWorkId as makeSiteWorkId } from "./capture_store.ts";
import type { DatasetRecord } from "./dataset.ts";

const SITE = "kakuyomu";

export type Quality = "良" | "駄";
export type Scope = "対象" | "対象外";
export type LabelValue = Quality | "対象外";

export interface LabelRecord2 {
  siteWorkId: string;
  quality?: Quality;
  scope: Scope;
  tags: string[];
  excluded: boolean;
  note?: string;
  updatedAt: string;
}

// 旧形式（1フィールドの label 特別値）。読み込み時に2軸へ正規化する。
interface LegacyLabel {
  workId: string;
  label: string;
  note?: string;
}

// URL・数値ID・接頭辞付きのいずれでも siteWorkId に正規化する。join キーの一元化はここ一箇所。
export function resolveSiteWorkId(input: string, site = SITE): string {
  if (/^[a-z0-9_-]+:\d+$/i.test(input)) return input; // 既に site:id 形式
  const workId = /^\d+$/.test(input) ? input : parseTargetUrl(input).workId;
  return makeSiteWorkId(site, workId);
}

export function setLabel(
  records: LabelRecord2[],
  siteWorkId: string,
  value: LabelValue,
  updatedAt: string,
  note?: string,
): LabelRecord2[] {
  const withNote = note !== undefined ? { note } : {};
  return upsert(records, siteWorkId, updatedAt, (rec) => {
    if (value === "対象外") {
      // スコープ軸に載せる。品質の良/駄には混ぜない。
      return { ...rec, scope: "対象外", ...withNote };
    }
    return { ...rec, quality: value, scope: "対象", ...withNote };
  });
}

// 「未ラベルに戻す」用: 指定 siteWorkId の行を除外した配列を返す。存在しない ID は不変。
// upsert の逆操作として純関数のまま置く（filter 相当だが、他の編集関数と対称の入口として明示）。
export function deleteLabel(records: LabelRecord2[], siteWorkId: string): LabelRecord2[] {
  return records.filter((r) => r.siteWorkId !== siteWorkId);
}

// tag 引数は "+タグ"（付与）/ "-タグ"（除去）。接頭辞なしは付与扱い。
export function toggleTag(
  records: LabelRecord2[],
  siteWorkId: string,
  tagArg: string,
  updatedAt: string,
): LabelRecord2[] {
  const remove = tagArg.startsWith("-");
  const tag = tagArg.replace(/^[+-]/, "");
  return upsert(records, siteWorkId, updatedAt, (rec) => {
    const tags = rec.tags.filter((t) => t !== tag);
    return { ...rec, tags: remove ? tags : [...tags, tag] };
  });
}

export function setExcluded(
  records: LabelRecord2[],
  siteWorkId: string,
  excluded: boolean,
  updatedAt: string,
): LabelRecord2[] {
  return upsert(records, siteWorkId, updatedAt, (rec) => ({ ...rec, excluded }));
}

function upsert(
  records: LabelRecord2[],
  siteWorkId: string,
  updatedAt: string,
  mutate: (rec: LabelRecord2) => LabelRecord2,
): LabelRecord2[] {
  const existing = records.find((r) => r.siteWorkId === siteWorkId);
  const base: LabelRecord2 = existing ??
    { siteWorkId, scope: "対象", tags: [], excluded: false, updatedAt };
  const updated = { ...mutate(base), siteWorkId, updatedAt };
  return existing
    ? records.map((r) => (r.siteWorkId === siteWorkId ? updated : r))
    : [...records, updated];
}

// 新形式・旧形式のどちらの行も読み、2軸へ正規化して返す。正規化はこの一箇所に集約する。
export function parseLabels2(text: string): LabelRecord2[] {
  const byId = new Map<string, LabelRecord2>();
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    const raw = JSON.parse(line) as Partial<LabelRecord2> & Partial<LegacyLabel>;
    const rec = raw.siteWorkId ? (raw as LabelRecord2) : normalizeLegacy(raw as LegacyLabel);
    byId.set(rec.siteWorkId, rec); // last-write-wins
  }
  return [...byId.values()];
}

function normalizeLegacy(old: LegacyLabel): LabelRecord2 {
  const siteWorkId = makeSiteWorkId(SITE, old.workId);
  const base: LabelRecord2 = {
    siteWorkId,
    scope: "対象",
    tags: [],
    excluded: false,
    updatedAt: "",
  };
  const withNote = old.note !== undefined ? { note: old.note } : {};
  if (old.label === "対象外") return { ...base, scope: "対象外", ...withNote };
  // 旧「ゴミ」表記は 2026-08 の改名時に「駄」へリネームされたため、読み込み時に自動移行する。
  // 既存 labels.jsonl を破壊的に書き換えず、次回 saveLabels2 で新表記に落ちる。
  const quality = old.label === "ゴミ" ? "駄" : old.label;
  if (quality === "良" || quality === "駄") {
    return { ...base, quality, ...withNote };
  }
  return { ...base, ...withNote };
}

export function toLabelsJsonl(records: LabelRecord2[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

export async function loadLabels2(path: string): Promise<LabelRecord2[]> {
  try {
    return parseLabels2(await Deno.readTextFile(path));
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return [];
    throw e;
  }
}

export async function saveLabels2(path: string, records: LabelRecord2[]): Promise<void> {
  await Deno.writeTextFile(path, toLabelsJsonl(records));
}

// dataset の既知作品集合（存在検証用）。新形式は siteWorkId、旧形式は workId から導出する。
export function datasetSiteWorkIds(records: DatasetRecord[]): Set<string> {
  return new Set(records.map((r) => r.siteWorkId ?? makeSiteWorkId(SITE, r.workId)));
}
