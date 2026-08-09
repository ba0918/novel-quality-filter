import { assertEquals } from "@std/assert";
import type { LineMetadata } from "../../src/domain/types.ts";
import { deriveLineMetrics, lineMetricsFromLines } from "./line_metrics.ts";

function meta(overrides: Partial<LineMetadata> = {}): LineMetadata {
  return {
    totalLines: 10,
    totalChars: 200,
    blankCount: 2,
    separatorCount: 0,
    narrative: {
      lineCount: 5,
      charCount: 150,
      short20: 1,
      short30: 3,
      chunkCount: 6,
      shortChunk20: 0,
      shortChunk30: 2,
    },
    dialogue: { lineCount: 2, charCount: 30, short20: 2, short30: 2 },
    meta: { lineCount: 1, charCount: 20, short20: 0, short30: 1 },
    nonTerminal: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
    ...overrides,
  };
}

Deno.test("deriveLineMetrics: 平均字/行は空行を除いた行数を分母にする", () => {
  // totalChars 200 / (totalLines 10 - blankCount 2) = 25
  assertEquals(deriveLineMetrics(meta()).avgCharsPerLine, 25);
});

Deno.test("deriveLineMetrics: 地の文短行率(30)は地の文の short30 / 地の文行数", () => {
  // narrative.short30 3 / narrative.lineCount 5 = 0.6
  assertEquals(deriveLineMetrics(meta()).narrativeShortLineRatio30, 0.6);
});

Deno.test("deriveLineMetrics: メタ率はメタ行数 / 総行数", () => {
  // meta.lineCount 1 / totalLines 10 = 0.1
  assertEquals(deriveLineMetrics(meta()).metaRatio, 0.1);
});

Deno.test("deriveLineMetrics: 分母0（空行のみ・地の文なし・総行0）はゼロ除算せず0に退避する", () => {
  const empty = meta({
    totalLines: 0,
    totalChars: 0,
    blankCount: 0,
    narrative: {
      lineCount: 0,
      charCount: 0,
      short20: 0,
      short30: 0,
      chunkCount: 0,
      shortChunk20: 0,
      shortChunk30: 0,
    },
    meta: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
  });
  assertEquals(deriveLineMetrics(empty), {
    avgCharsPerLine: 0,
    narrativeShortLineRatio30: 0,
    metaRatio: 0,
  });

  // 空行のみ（非空行0）でも平均字/行はゼロ除算しない。
  const blankOnly = meta({ totalLines: 3, totalChars: 0, blankCount: 3 });
  assertEquals(deriveLineMetrics(blankOnly).avgCharsPerLine, 0);
});

Deno.test("lineMetricsFromLines: LineData集合から集計して3指標を導出する", () => {
  const lines = [
    { text: "これは地の文の長い一文です。", isBlank: false },
    { text: "短い。", isBlank: false },
    { text: "", isBlank: true },
    { text: "「セリフ」", isBlank: false },
  ];
  const m = lineMetricsFromLines(lines);
  // 3指標が [0,1] または字数として妥当な非負値で返ることを確認する（集計の結線）。
  assertEquals(m.metaRatio, 0);
  assertEquals(m.narrativeShortLineRatio30 >= 0 && m.narrativeShortLineRatio30 <= 1, true);
  assertEquals(m.avgCharsPerLine > 0, true);
});
