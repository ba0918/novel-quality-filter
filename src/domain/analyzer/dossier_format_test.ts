import { assertEquals } from "@std/assert";
import type { CategoryCount, LineMetadata, NarrativeCount } from "../types.ts";
import {
  averageCharsLabel,
  averagePerLineLabel,
  compositionSegments,
  formatInt,
  formatRawValue,
  isNarrativeCount,
  percentInt,
  percentOne,
  safeHref,
  widthPercent,
} from "./dossier_format.ts";

Deno.test("safeHref: http/https はエスケープして通す", () => {
  assertEquals(safeHref("https://kakuyomu.jp/works/1"), "https://kakuyomu.jp/works/1");
  assertEquals(safeHref("http://example.com/a?b=1&c=2"), "http://example.com/a?b=1&amp;c=2");
});

Deno.test("safeHref: スキーム無し（相対・アンカー）はエスケープして通す", () => {
  assertEquals(safeHref("#anchor"), "#anchor");
  assertEquals(safeHref("/works/1"), "/works/1");
});

Deno.test("safeHref: javascript: など http/https 以外のスキームを無害化する", () => {
  assertEquals(safeHref("javascript:alert(1)"), "#");
  assertEquals(safeHref("JavaScript:alert(1)"), "#"); // 大文字小文字を無視
  assertEquals(safeHref("data:text/html,<script>alert(1)</script>"), "#");
  assertEquals(safeHref("  javascript:alert(1)"), "#"); // 先頭空白での回避
  assertEquals(safeHref("java\tscript:alert(1)"), "#"); // 制御文字での分断回避
});

Deno.test("safeHref: protocol-relative（//host）は現在ページのスキームを引き継ぐため無害化する", () => {
  // http(s) 上の較正ツール HTML から //evil.example/x を踏むと http(s)://evil.example/x に化ける。
  // 相対パス（/works/1）は許可したいので、// で始まる場合のみ弾く。
  assertEquals(safeHref("//evil.example/x"), "#");
  assertEquals(safeHref("  //evil.example/x"), "#"); // 先頭空白での回避
});

Deno.test("formatRawValue: 1未満は百分率1桁、1以上は実数1桁", () => {
  assertEquals(formatRawValue(0.234), "23.4%");
  assertEquals(formatRawValue(0), "0.0%");
  assertEquals(formatRawValue(0.999), "99.9%");
  assertEquals(formatRawValue(1), "1.0");
  assertEquals(formatRawValue(12.53), "12.5");
});

Deno.test("formatInt: 3桁区切りを入れる", () => {
  assertEquals(formatInt(0), "0");
  assertEquals(formatInt(999), "999");
  assertEquals(formatInt(1000), "1,000");
  assertEquals(formatInt(1234567), "1,234,567");
});

Deno.test("percentInt: 分母0は退避、それ以外は整数%", () => {
  assertEquals(percentInt(1, 0), "-");
  assertEquals(percentInt(1, 4), "25%");
  assertEquals(percentInt(2, 3), "67%");
});

Deno.test("percentOne: 分母0は退避、それ以外は1桁%", () => {
  assertEquals(percentOne(1, 0), "-");
  assertEquals(percentOne(4, 10), "40.0%");
  assertEquals(percentOne(1, 3), "33.3%");
});

Deno.test("widthPercent: 分母0は0、100で頭打ち", () => {
  assertEquals(widthPercent(1, 0), 0);
  assertEquals(widthPercent(4, 10), 40);
  assertEquals(widthPercent(5, 2), 100);
});

Deno.test("averagePerLineLabel: 空行を除く1行平均字。分母0は退避", () => {
  const meta = (totalLines: number, totalChars: number, blankCount: number): LineMetadata => ({
    totalLines,
    totalChars,
    blankCount,
    separatorCount: 0,
    narrative: {
      lineCount: 0,
      charCount: 0,
      short20: 0,
      short30: 0,
      chunkCount: 0,
      shortChunk20: 0,
      shortChunk30: 0,
    },
    dialogue: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
    meta: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
    nonTerminal: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
  });
  assertEquals(averagePerLineLabel(meta(10, 200, 2)), "25.0字/行");
  assertEquals(averagePerLineLabel(meta(3, 50, 3)), "-");
});

Deno.test("averageCharsLabel: 1行平均字。行0は退避", () => {
  const count: CategoryCount = { lineCount: 4, charCount: 120, short20: 0, short30: 0 };
  assertEquals(averageCharsLabel(count), "30.0字");
  assertEquals(
    averageCharsLabel({ lineCount: 0, charCount: 0, short20: 0, short30: 0 }),
    "-",
  );
});

Deno.test("isNarrativeCount: chunkCount を持つものだけ地の文カウント", () => {
  const narrative: NarrativeCount = {
    lineCount: 1,
    charCount: 1,
    short20: 0,
    short30: 0,
    chunkCount: 1,
    shortChunk20: 0,
    shortChunk30: 0,
  };
  const plain: CategoryCount = { lineCount: 1, charCount: 1, short20: 0, short30: 0 };
  assertEquals(isNarrativeCount(narrative), true);
  assertEquals(isNarrativeCount(plain), false);
});

Deno.test("compositionSegments: 6区分の [slug,count] を構成順に返す", () => {
  const meta: LineMetadata = {
    totalLines: 10,
    totalChars: 200,
    blankCount: 2,
    separatorCount: 1,
    narrative: {
      lineCount: 4,
      charCount: 120,
      short20: 0,
      short30: 0,
      chunkCount: 0,
      shortChunk20: 0,
      shortChunk30: 0,
    },
    dialogue: { lineCount: 2, charCount: 30, short20: 0, short30: 0 },
    meta: { lineCount: 1, charCount: 10, short20: 0, short30: 0 },
    nonTerminal: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
  };
  assertEquals(compositionSegments(meta), [
    ["narrative", 4],
    ["dialogue", 2],
    ["meta", 1],
    ["nonterm", 0],
    ["blank", 2],
    ["sep", 1],
  ]);
});
