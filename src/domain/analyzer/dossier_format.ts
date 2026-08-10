// 詳細分析票（dossier）の値整形の純粋関数。DOM 版（work-page-injector）と HTML 文字列版
// （較正ツールの render_dossier）が共有する。表示ロジックを1箇所へ集約し二重実装を防ぐ。
// 本文由来文字列を HTML へ埋めるときのエスケープもここに置く。

import type { CategoryCount, LineMetadata, NarrativeCount } from "../types.ts";

export function formatRawValue(value: number): string {
  if (value < 1) return (value * 100).toFixed(1) + "%";
  return value.toFixed(1);
}

export function formatInt(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function percentInt(numerator: number, denominator: number): string {
  if (denominator === 0) return "-";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function percentOne(numerator: number, denominator: number): string {
  if (denominator === 0) return "-";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function widthPercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.min(100, (numerator / denominator) * 100);
}

export function averagePerLineLabel(meta: LineMetadata): string {
  const denominator = meta.totalLines - meta.blankCount;
  if (denominator <= 0) return "-";
  return `${(meta.totalChars / denominator).toFixed(1)}字/行`;
}

export function averageCharsLabel(count: CategoryCount): string {
  if (count.lineCount === 0) return "-";
  return `${(count.charCount / count.lineCount).toFixed(1)}字`;
}

export function isNarrativeCount(count: CategoryCount): count is NarrativeCount {
  return "chunkCount" in count;
}

export function compositionSegments(meta: LineMetadata): Array<[string, number]> {
  return [
    ["narrative", meta.narrative.lineCount],
    ["dialogue", meta.dialogue.lineCount],
    ["meta", meta.meta.lineCount],
    ["nonterm", meta.nonTerminal.lineCount],
    ["blank", meta.blankCount],
    ["sep", meta.separatorCount],
  ];
}

// HTML 文字列レンダラ（render_dossier）が本文由来テキスト（タイトル・作者名）を埋めるときに
// XSS・タグ崩れを防ぐ。DOM 版は textContent 経由なので不要だが、ここに置いて共有する。
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
