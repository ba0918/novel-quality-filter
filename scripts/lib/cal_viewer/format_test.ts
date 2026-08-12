// format.js（ブラウザ側）と dossier_format.ts（Deno側/DOM版）の対応関数が同じ入力に対して
// 同じ出力を返すことを検証する。二重実装のドリフトを防ぐための同期テスト。
// Deno は .js を直接 import できるため、ビルドなしで同一ファイルをブラウザにも配れる。

import { assertEquals } from "@std/assert";
import type { CategoryCount, LineMetadata, NarrativeCount } from "../../../src/domain/types.ts";
import * as denoFormat from "../../../src/domain/analyzer/dossier_format.ts";
import * as jsFormat from "./format.js";

Deno.test("formatRawValue: 1未満はパーセント、それ以外は小数第1位表示で一致する", () => {
  for (const v of [0, 0.153, 0.999, 1, 12.34, 100]) {
    assertEquals(jsFormat.formatRawValue(v), denoFormat.formatRawValue(v));
  }
});

Deno.test("formatInt: 3桁区切りのカンマ表示で一致する", () => {
  for (const n of [0, 5, 999, 1000, 1234567]) {
    assertEquals(jsFormat.formatInt(n), denoFormat.formatInt(n));
  }
});

Deno.test("percentInt: 整数パーセント表示で一致する（分母0は '-'）", () => {
  const cases: Array<[number, number]> = [[1, 4], [0, 0], [3, 3], [1, 3]];
  for (const [num, den] of cases) {
    assertEquals(jsFormat.percentInt(num, den), denoFormat.percentInt(num, den));
  }
});

Deno.test("percentOne: 小数第1位パーセント表示で一致する（分母0は '-'）", () => {
  const cases: Array<[number, number]> = [[1, 4], [0, 0], [3, 3], [1, 3]];
  for (const [num, den] of cases) {
    assertEquals(jsFormat.percentOne(num, den), denoFormat.percentOne(num, den));
  }
});

Deno.test("widthPercent: 0-100 にクランプした割合が一致する（分母0は0）", () => {
  const cases: Array<[number, number]> = [[1, 4], [0, 0], [10, 3]];
  for (const [num, den] of cases) {
    assertEquals(jsFormat.widthPercent(num, den), denoFormat.widthPercent(num, den));
  }
});

const LINE_META: LineMetadata = {
  totalLines: 10,
  totalChars: 200,
  blankCount: 2,
  separatorCount: 1,
  narrative: {
    lineCount: 4,
    charCount: 120,
    short14: 0,
    short20: 1,
    short30: 2,
    chunkCount: 6,
    shortChunk14: 0,
    shortChunk20: 2,
    shortChunk30: 3,
  } as NarrativeCount,
  dialogue: { lineCount: 3, charCount: 60, short14: 0, short20: 0, short30: 1 } as CategoryCount,
  meta: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 } as CategoryCount,
  nonTerminal: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 } as CategoryCount,
};

Deno.test("averagePerLineLabel: 平均字/行の表示が一致する", () => {
  assertEquals(jsFormat.averagePerLineLabel(LINE_META), denoFormat.averagePerLineLabel(LINE_META));
});

Deno.test("averageCharsLabel: カテゴリ平均字数の表示が一致する（0行は '-'）", () => {
  assertEquals(
    jsFormat.averageCharsLabel(LINE_META.narrative),
    denoFormat.averageCharsLabel(LINE_META.narrative),
  );
  assertEquals(
    jsFormat.averageCharsLabel(LINE_META.meta),
    denoFormat.averageCharsLabel(LINE_META.meta),
  );
});

Deno.test("compositionSegments: 行構成比の内訳が一致する", () => {
  assertEquals(jsFormat.compositionSegments(LINE_META), denoFormat.compositionSegments(LINE_META));
});

Deno.test("safeHref: http/https/相対URLは許可、危険スキームは同じ判定で拒否する", () => {
  const urls = [
    "https://kakuyomu.jp/works/1",
    "http://example.com/",
    "/relative/path",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//evil.example.com/host-relative",
    "java\tscript:alert(1)",
  ];
  for (const url of urls) {
    const denoResult = denoFormat.safeHref(url);
    const denoAllowed = denoResult !== "#";
    const jsResult = jsFormat.safeHref(url);
    const jsAllowed = jsResult !== "#";
    assertEquals(jsAllowed, denoAllowed, `accept/reject差: ${url}`);
  }
});

Deno.test("formatPenaltyMultiplier: Deno側とブラウザ側が同じ出力を返す", () => {
  for (const v of [0.9111111111111111, 0.85, 0.55, 0.8999999999999999, 1]) {
    assertEquals(jsFormat.formatPenaltyMultiplier(v), denoFormat.formatPenaltyMultiplier(v));
  }
  assertEquals(jsFormat.formatPenaltyMultiplier(0.9111111111111111), "0.911");
});
