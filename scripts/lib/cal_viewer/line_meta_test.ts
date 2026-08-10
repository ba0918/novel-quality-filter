// line_meta.js（行データセクションの集計・整形）の単体テスト。
// カテゴリ別集計の正しさに加え、Deno側 dossier_format.ts の対応関数（averagePerLineLabel /
// averageCharsLabel / compositionSegments / percentInt / percentOne / widthPercent）を組み合わせて
// 求めた期待値と一致することを検証する（format_test.ts と同じ同期テストの方式。line_meta.js の
// 各関数自体はdossier_format.tsに1:1対応する関数を持たないため、対応する低レベル関数の合成で
// 期待値を組み立てる）。

import { assertEquals, assertThrows } from "@std/assert";
import type { CategoryCount, LineMetadata, NarrativeCount } from "../../../src/domain/types.ts";
import * as denoFormat from "../../../src/domain/analyzer/dossier_format.ts";
import {
  bandSegments,
  categoryBreakdown,
  isShortRatioWarn,
  shortBarRatio,
  summarize,
} from "./line_meta.js";

// format_test.ts と同じ最小フィクスチャ（再現性のため同じ値を使う）。
const LINE_META: LineMetadata = {
  totalLines: 10,
  totalChars: 200,
  blankCount: 2,
  separatorCount: 1,
  narrative: {
    lineCount: 4,
    charCount: 120,
    short20: 1,
    short30: 2,
    chunkCount: 6,
    shortChunk20: 2,
    shortChunk30: 3,
  } as NarrativeCount,
  dialogue: { lineCount: 3, charCount: 60, short20: 0, short30: 1 } as CategoryCount,
  meta: { lineCount: 0, charCount: 0, short20: 0, short30: 0 } as CategoryCount,
  nonTerminal: { lineCount: 0, charCount: 0, short20: 0, short30: 0 } as CategoryCount,
};

// モック（cal_viewer_mockup.html）のサンプル値と同じ行数構成。空行703（47%）など画像のサンプル
// 値でbandSegmentsの合計幅100%を検証するためのフィクスチャ。文字数は band 計算に使わないため
// 未使用フィールドはダミー値で埋める（narrative以外は同型のためCategoryCountでまとめて作る）。
function dummyCategory(lineCount: number): CategoryCount {
  return { lineCount, charCount: 0, short20: 0, short30: 0 };
}
const MOCK_LINE_META: LineMetadata = {
  totalLines: 1499,
  totalChars: 0,
  blankCount: 703,
  separatorCount: 27,
  narrative: { ...dummyCategory(305), chunkCount: 0, shortChunk20: 0, shortChunk30: 0 },
  dialogue: dummyCategory(99),
  meta: dummyCategory(207),
  nonTerminal: dummyCategory(158),
};

Deno.test("summarize: 総行・総文字・空行率・区切り率を正しく返す", () => {
  const result = summarize(LINE_META);
  assertEquals(result.totalLines, 10);
  assertEquals(result.totalChars, 200);
  assertEquals(result.blankCount, 2);
  assertEquals(result.blankRatioLabel, denoFormat.percentInt(2, 10));
  assertEquals(result.separatorCount, 1);
  assertEquals(result.separatorRatioLabel, denoFormat.percentInt(1, 10));
  assertEquals(result.averagePerLine, denoFormat.averagePerLineLabel(LINE_META));
});

Deno.test("summarize: 地の文短行30率のwarnはisShortRatioWarnと同じ閾値で判定される", () => {
  // narrative.short30=2, narrative.lineCount=4 → ratio=0.5（閾値ちょうど、"超え"ではないのでfalse）
  const result = summarize(LINE_META);
  assertEquals(result.narrativeShort30.ratioLabel, denoFormat.percentInt(2, 4));
  assertEquals(result.narrativeShort30.warn, false);
});

Deno.test("isShortRatioWarn: 閾値0.5を超えたときだけwarnになる（境界は超えない）", () => {
  assertEquals(isShortRatioWarn(0.5), false);
  assertEquals(isShortRatioWarn(0.5001), true);
  assertEquals(isShortRatioWarn(0.49), false);
  assertEquals(isShortRatioWarn(0), false);
  assertEquals(isShortRatioWarn(1), true);
});

Deno.test("bandSegments: 6区分の合計幅が100%になる（モックのサンプル行数構成で検証）", () => {
  const segments = bandSegments(MOCK_LINE_META);
  assertEquals(segments.map(([name]) => name), [
    "narrative",
    "dialogue",
    "meta",
    "nonterm",
    "blank",
    "sep",
  ]);
  const total = segments.reduce((sum, [, width]) => sum + width, 0);
  assertEquals(Math.round(total * 100) / 100, 100);

  // モック画像のサンプル値（1桁小数）と一致することを確認する。
  const rounded = Object.fromEntries(
    segments.map(([name, width]) => [name, Math.round(width * 10) / 10]),
  );
  assertEquals(rounded, {
    narrative: 20.3,
    dialogue: 6.6,
    meta: 13.8,
    nonterm: 10.5,
    blank: 46.9,
    sep: 1.8,
  });
});

Deno.test("bandSegments: dossier_format.ts の compositionSegments + widthPercent の合成と一致する", () => {
  const expected = denoFormat.compositionSegments(LINE_META).map((
    [name, count],
  ): [string, number] => [name, denoFormat.widthPercent(count, LINE_META.totalLines)]);
  assertEquals(bandSegments(LINE_META), expected);
});

Deno.test("categoryBreakdown: 地の文カテゴリの行/文字/短行20/30/短チャンク20/30を正しく返す", () => {
  const result = categoryBreakdown(LINE_META, "narrative");
  assertEquals(result.lineCount.value, 4);
  assertEquals(result.lineCount.ratioLabel, denoFormat.percentOne(4, 10));
  assertEquals(result.charCount.value, 120);
  assertEquals(result.charCount.ratioLabel, denoFormat.percentOne(120, 200));
  assertEquals(result.short20.value, 1);
  assertEquals(result.short20.ratioLabel, denoFormat.percentInt(1, 4));
  assertEquals(result.short30.value, 2);
  assertEquals(result.short30.ratioLabel, denoFormat.percentInt(2, 4));
  assertEquals(result.avgCharsLabel, denoFormat.averageCharsLabel(LINE_META.narrative));
  // 地の文だけ短チャンクを含む
  assertEquals(result.shortChunk20?.value, 2);
  assertEquals(result.shortChunk20?.ratioLabel, denoFormat.percentInt(2, 6));
  assertEquals(result.shortChunk30?.value, 3);
  assertEquals(result.shortChunk30?.ratioLabel, denoFormat.percentInt(3, 6));
  assertEquals(result.chunkCountLabel, denoFormat.formatInt(6));
});

Deno.test("categoryBreakdown: セリフ/メタ/非文末カテゴリは短チャンクを含まない", () => {
  for (const key of ["dialogue", "meta", "nonTerminal"] as const) {
    const result = categoryBreakdown(LINE_META, key);
    assertEquals(result.shortChunk20, undefined);
    assertEquals(result.shortChunk30, undefined);
    assertEquals(result.chunkCountLabel, undefined);
  }
});

Deno.test("categoryBreakdown: 文字数比率は分母がtotalCharsであり、行数比率とは独立して51.7%のような値を取り得る（totalCharsに対して過大なwarn誤判定をしない）", () => {
  // narrative.charCount=120, totalChars=200 → 60%だが、lineCount/charCountの行・文字エントリは
  // warnを一切立てない（短行/短チャンクのみがwarn対象という設計の回帰防止）。
  const result = categoryBreakdown(LINE_META, "narrative");
  assertEquals(result.lineCount.warn, false);
  assertEquals(result.charCount.warn, false);
});

Deno.test("categoryBreakdown: 未知のカテゴリキーを渡すとエラーになる", () => {
  assertThrows(() => categoryBreakdown(LINE_META, "bogus"));
});

Deno.test("shortBarRatio: short30側のratioを返す（short20側の値と混同しない）", () => {
  const entry20 = { value: 1, ratio: 0.5, ratioLabel: "50%", warn: false };
  const entry30 = { value: 2, ratio: 0.9, ratioLabel: "90%", warn: true };
  assertEquals(shortBarRatio(entry20, entry30), 0.9);
});
