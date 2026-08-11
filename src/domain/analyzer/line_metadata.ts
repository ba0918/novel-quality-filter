import type { CategoryCount, LineData, LineMetadata, NarrativeCount } from "../types.ts";
import { classifyLine } from "./line_classifier.ts";
import { splitSentences } from "./sentences.ts";
import {
  SHORT_LINE_THRESHOLD_14,
  SHORT_LINE_THRESHOLD_20,
  SHORT_LINE_THRESHOLD_30,
} from "./constants.ts";

// 各行を classifyLine で排他分類し、カテゴリ別の分量（行数・文字数）と短さ（短行20/30）を
// 集計する。地の文は句点チャンク数と短チャンク20/30も数える。率は保存せず、分子（短カウント）と
// 分母（行数・文字数）だけを持ち、表示時に必要な率を組み立てられるようにする。
export function aggregateLineMetadata(lines: LineData[]): LineMetadata {
  const narrative = emptyNarrative();
  const dialogue = emptyCategory();
  const meta = emptyCategory();
  const nonTerminal = emptyCategory();

  let totalLines = 0;
  let totalChars = 0;
  let blankCount = 0;
  let separatorCount = 0;

  for (const line of lines) {
    const chars = countChars(line.text);
    totalLines++;
    totalChars += chars;

    switch (classifyLine(line)) {
      case "blank":
        blankCount++;
        break;
      case "separator":
        separatorCount++;
        break;
      case "meta":
        addLine(meta, chars);
        break;
      case "dialogue":
        addLine(dialogue, chars);
        break;
      case "non-terminal":
        addLine(nonTerminal, chars);
        break;
      case "narrative":
        addLine(narrative, chars);
        addChunks(narrative, line.text);
        break;
    }
  }

  return {
    totalLines,
    totalChars,
    blankCount,
    separatorCount,
    narrative,
    dialogue,
    meta,
    nonTerminal,
  };
}

// 空白・全角スペースを除いたコードポイント数。20/30の短さ境界を絵文字・補助漢字で
// 誤判定しないよう、UTF-16 コード単位ではなくコードポイントで数える（サロゲートペアを1字）。
function countChars(text: string): number {
  return [...text.trim().replace(/[\s　]/g, "")].length;
}

function addLine(category: CategoryCount, chars: number): void {
  category.lineCount++;
  category.charCount += chars;
  if (chars < SHORT_LINE_THRESHOLD_14) category.short14++;
  if (chars < SHORT_LINE_THRESHOLD_20) category.short20++;
  if (chars < SHORT_LINE_THRESHOLD_30) category.short30++;
}

function addChunks(narrative: NarrativeCount, text: string): void {
  const chunks = splitSentences(text);
  // 句点で分割できない行（句点のみ・句点なし）も1チャンクとして数える。
  const effective = chunks.length > 0 ? chunks : [text];
  for (const chunk of effective) {
    narrative.chunkCount++;
    const chars = countChars(chunk);
    if (chars < SHORT_LINE_THRESHOLD_14) narrative.shortChunk14++;
    if (chars < SHORT_LINE_THRESHOLD_20) narrative.shortChunk20++;
    if (chars < SHORT_LINE_THRESHOLD_30) narrative.shortChunk30++;
  }
}

function emptyCategory(): CategoryCount {
  return { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 };
}

function emptyNarrative(): NarrativeCount {
  return { ...emptyCategory(), chunkCount: 0, shortChunk14: 0, shortChunk20: 0, shortChunk30: 0 };
}
