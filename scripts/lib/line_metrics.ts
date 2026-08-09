// 行メタ3指標の導出（薄いラッパ）。集計そのものは src/domain の aggregateLineMetadata を再利用し、
// ここでは保存済みの分子・分母から表示・分析用の率/平均を組み立てるだけ。分母0はゼロ除算せず0へ退避。

import type { LineData, LineMetadata } from "../../src/domain/types.ts";
import { aggregateLineMetadata } from "../../src/domain/analyzer/line_metadata.ts";

export interface LineMetrics {
  // 空行を除いた1行あたりの平均文字数。少ないほど中身が薄い疑い。
  avgCharsPerLine: number;
  // 地の文のうち30文字未満の短い行の割合。高いほど内容の薄い地の文が多い疑い。
  narrativeShortLineRatio30: number;
  // 全行に占めるメタ行（装飾行）の割合。高いほど飾りで水増しの疑い。
  metaRatio: number;
}

export function deriveLineMetrics(meta: LineMetadata): LineMetrics {
  return {
    avgCharsPerLine: ratio(meta.totalChars, meta.totalLines - meta.blankCount),
    narrativeShortLineRatio30: ratio(meta.narrative.short30, meta.narrative.lineCount),
    metaRatio: ratio(meta.meta.lineCount, meta.totalLines),
  };
}

export function lineMetricsFromLines(lines: LineData[]): LineMetrics {
  return deriveLineMetrics(aggregateLineMetadata(lines));
}

function ratio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : numerator / denominator;
}
