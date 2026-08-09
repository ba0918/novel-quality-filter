import type { LineCategory, LineData } from "../types.ts";
import {
  META_PREFIX_CHARS,
  META_WRAP_CHARS,
  SEPARATOR_LINE_PATTERN,
  SEPARATOR_PATTERN,
} from "./constants.ts";

// 優先順位付きの排他分類。最初にマッチしたカテゴリで確定する。
// メタをセリフより先に置くのは、末尾が 』 のステータス行（【レベル】…『９５』）を
// セリフへ誤分類しないため。メタは行頭記号で判定し、文中の【】を持つ地の文を誤爆させない。
export function classifyLine(line: LineData): LineCategory {
  if (line.isBlank) return "blank";

  const trimmed = line.text.trim();
  if (trimmed.length === 0) return "blank";
  if (isSeparatorLine(trimmed)) return "separator";
  if (isMetaLine(trimmed)) return "meta";
  if (trimmed.endsWith("」") || trimmed.endsWith("』")) return "dialogue";
  if (trimmed.endsWith("。")) return "narrative";
  return "non-terminal";
}

function isSeparatorLine(trimmed: string): boolean {
  const compact = trimmed.replace(/[\s　]/g, "");
  return SEPARATOR_PATTERN.test(trimmed) || SEPARATOR_LINE_PATTERN.test(compact);
}

function isMetaLine(trimmed: string): boolean {
  const first = trimmed[0];
  if (META_PREFIX_CHARS.has(first)) return true;

  const last = trimmed[trimmed.length - 1];
  return trimmed.length >= 2 && META_WRAP_CHARS.has(first) && META_WRAP_CHARS.has(last);
}
