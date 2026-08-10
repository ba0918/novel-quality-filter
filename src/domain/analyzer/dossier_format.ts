// 詳細分析票（dossier）の値整形の純粋関数。本番拡張の DOM 版（work-page-injector）が使う。
// 較正ツールのブラウザ側ビューア（scripts/lib/cal_viewer/format.js）は同じロジックを別実装し、
// format_test.ts が両者の出力一致を担保する（同一モジュール共有はせず、あえて二重実装）。
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

// 本文由来テキスト（タイトル・作者名）を HTML 文字列へ埋めるときに XSS・タグ崩れを防ぐ。
// DOM 版（work-page-injector）は textContent 経由なので不要だが、ブラウザ側 safeHref
// （cal_viewer/format.js）の参照実装としてここに残す。
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// href 属性用に URL のスキームを検証する。http/https 以外（javascript: data: 等）は無害化する。
// escapeHtml は属性値の引用符崩れは防ぐが、javascript: 自体は素通しするため別途スキーム検査が要る。
// ブラウザはスキーム判定時に制御文字・空白を無視するため、判定前に除去してから照合する
// （java\tscript: のような分断による回避を防ぐ）。相対URL・アンカー（スキーム無し）は許可するが、
// protocol-relative（//host/path）は現在ページのスキームを引き継いで外部ホストへ抜けるため弾く。
export function safeHref(url: string): string {
  const stripped = [...url].filter((ch) => ch.charCodeAt(0) > 0x20).join("");
  if (stripped.startsWith("//")) return "#";
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(stripped);
  if (scheme && !["http", "https"].includes(scheme[1].toLowerCase())) {
    return "#";
  }
  return escapeHtml(url.trim());
}
