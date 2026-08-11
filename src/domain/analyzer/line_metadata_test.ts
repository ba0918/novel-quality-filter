import { assertEquals } from "@std/assert";
import type { LineData } from "../types.ts";
import { aggregateLineMetadata } from "./line_metadata.ts";

function line(text: string, isBlank = false): LineData {
  return { text, isBlank };
}

Deno.test("aggregateLineMetadata: ステータス窓ブロックがメタ・区切り線・空行に集計されセリフや非文末に化けない", () => {
  const meta = aggregateLineMetadata([
    line("【ステータス】"),
    line("――――――――"),
    line("《ＨＰ》２５／２５"),
    line("", true),
    line("【レベル】現在値『９５』"),
  ]);
  assertEquals(meta.meta.lineCount, 3);
  assertEquals(meta.separatorCount, 1);
  assertEquals(meta.blankCount, 1);
  assertEquals(meta.dialogue.lineCount, 0);
  assertEquals(meta.nonTerminal.lineCount, 0);
  assertEquals(meta.narrative.lineCount, 0);
  assertEquals(meta.totalLines, 5);
});

Deno.test("aggregateLineMetadata: 短行20/30は空白・全角スペース除去後の文字数で判定する", () => {
  // 全角スペース込みで生の長さは20字超だが、除去後は6字なので短行として数える。
  const meta = aggregateLineMetadata([line("私　は　走　っ　た。")]);
  assertEquals(meta.narrative.charCount, 6);
  assertEquals(meta.narrative.short20, 1);
  assertEquals(meta.narrative.short30, 1);
  assertEquals(meta.totalChars, 6);
});

Deno.test("aggregateLineMetadata: 句点チャンク数は最低1で数え地の文チャンク数は常に地の文行数以上", () => {
  const meta = aggregateLineMetadata([
    line("猫がいた。"), // 1 chunk
    line("犬もいた。走った。"), // 2 chunks
    line("。"), // 句点のみ（分割結果が空でも最低1チャンク）
  ]);
  assertEquals(meta.narrative.lineCount, 3);
  assertEquals(meta.narrative.chunkCount, 4);
  assertEquals(meta.narrative.chunkCount >= meta.narrative.lineCount, true);
});

Deno.test("aggregateLineMetadata: 短チャンクは地の文でのみ数え、セリフ・メタは行のみ数える", () => {
  const meta = aggregateLineMetadata([
    line("はい。"), // narrative: チャンク「はい」→ 短チャンク
    line("「うん」"), // dialogue: 行のみ（チャンクは持たない）
    line("【メモ】"), // meta: 行のみ
  ]);
  assertEquals(meta.narrative.shortChunk20, 1);
  assertEquals(meta.narrative.shortChunk30, 1);
  assertEquals(meta.narrative.chunkCount, 1);
  assertEquals(meta.dialogue.short20, 1);
  assertEquals(meta.meta.short20, 1);
});

Deno.test("aggregateLineMetadata: サロゲートペア（絵文字）はコードポイント数で数え20/30を判定する", () => {
  // 絵文字20個＋句点＝21コードポイント。UTF-16 コード単位（.length）だと41になり
  // short30 の境界（<30）を跨いで誤判定するため、コードポイント数で数える。
  const meta = aggregateLineMetadata([line("😀".repeat(20) + "。")]);
  assertEquals(meta.narrative.charCount, 21);
  assertEquals(meta.narrative.short20, 0);
  assertEquals(meta.narrative.short30, 1);
  assertEquals(meta.totalChars, 21);
});

Deno.test("aggregateLineMetadata: 率は保存せず分子と分母だけを保持する", () => {
  const meta = aggregateLineMetadata([
    line("静かな朝だった。"),
    line("「おはよう」"),
    line("", true),
  ]);
  assertEquals(meta, {
    totalLines: 3,
    totalChars: 14,
    blankCount: 1,
    separatorCount: 0,
    narrative: {
      lineCount: 1,
      charCount: 8,
      short14: 1,
      short20: 1,
      short30: 1,
      chunkCount: 1,
      shortChunk14: 1,
      shortChunk20: 1,
      shortChunk30: 1,
    },
    dialogue: { lineCount: 1, charCount: 6, short14: 1, short20: 1, short30: 1 },
    meta: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
    nonTerminal: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
  });
});

Deno.test("aggregateLineMetadata: short14 は 14字未満で判定する（境界: 13字は短行、14字は非短行）", () => {
  // 行判定は 。込みのコードポイント数、チャンク判定は 。を除いた文字数、を反映するよう
  // 行と句点チャンクで別々に境界を確認する。
  const meta = aggregateLineMetadata([
    line("一二三四五六七八九十一二。"), // 行=13cp, chunk=12cp
    line("一二三四五六七八九十一二三。"), // 行=14cp, chunk=13cp
  ]);
  assertEquals(meta.narrative.charCount, 27);
  // 行レベル: 13<14 は短行、14<14 は非短行
  assertEquals(meta.narrative.short14, 1);
  assertEquals(meta.narrative.short20, 2);
  // チャンクレベル: 12/13 は両方 <14 なので shortChunk14 は 2
  assertEquals(meta.narrative.shortChunk14, 2);
  assertEquals(meta.narrative.shortChunk20, 2);
});
