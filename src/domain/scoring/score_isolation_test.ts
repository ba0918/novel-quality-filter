import { assertAlmostEquals, assertEquals } from "@std/assert";
import type { CategoryCount, LineMetadata, NarrativeCount, RawMetrics } from "../types.ts";
import { calculateScore } from "./mod.ts";
import { aggregateLineMetadata } from "../analyzer/line_metadata.ts";

// スコア寄与の契約:
//   - lineMetadata は「weight 指標または penalty rule から参照される派生値」だけがスコアに影響する
//   - それ以外の lineMetadata フィールド（dialogue / meta / non-terminal / narrative の
//     参照されない集計）は素通しでスコアを動かさない
// 現行で参照されるのは narrative.charCount / lineCount（narrativeCharPerLine 指標）と
// narrative.short14 / lineCount（「地の文短行14 の過多」grade ペナルティ）のみ。
// 候補 D (rev 20260812190006) で narrative.charCount がスコア入力へ昇格した（この契約書き直しが
// 「スコア入力の昇格を明示的に扱う」の実行）。将来さらに増えたときも同様にここを書き直す。

const SAMPLE: RawMetrics = {
  charCount: 1200,
  sentenceCount: 40,
  sentenceLengthSD: 12.5,
  singleSentParaRatio: 0.3,
  paragraphLengthSD: 30,
  separatorCount: 2,
  separatorFrequency: 0.05,
  ttr: 0.6,
  dialogueCount: 10,
  dialogueEndingVariety: 0.7,
  descriptionDensitySD: 0.2,
  taigendomeEntropy: 1.5,
  emotionDirectnessRatio: 0.1,
  logicalConnectiveDensity: 0.02,
  paragraphTransitionEntropy: 1.8,
  sentenceLengthBurstiness: 0.4,
};

function makeCategory(overrides: Partial<CategoryCount> = {}): CategoryCount {
  return { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0, ...overrides };
}

function makeNarrative(overrides: Partial<NarrativeCount> = {}): NarrativeCount {
  return {
    lineCount: 0,
    charCount: 0,
    short14: 0,
    short20: 0,
    short30: 0,
    chunkCount: 0,
    shortChunk14: 0,
    shortChunk20: 0,
    shortChunk30: 0,
    ...overrides,
  };
}

function makeLineMetadata(overrides: Partial<LineMetadata> = {}): LineMetadata {
  return {
    totalLines: 100,
    totalChars: 3000,
    blankCount: 0,
    separatorCount: 0,
    narrative: makeNarrative(),
    dialogue: makeCategory(),
    meta: makeCategory(),
    nonTerminal: makeCategory(),
    ...overrides,
  };
}

Deno.test("スコア非干渉: 別経路で aggregateLineMetadata を呼んでも共有状態は汚れない", () => {
  const before = calculateScore(SAMPLE);
  aggregateLineMetadata([{ text: "静かな朝だった。", isBlank: false }]);
  const after = calculateScore(SAMPLE);
  assertEquals(after, before);
  // lineMetadata は score-handler が添付する診断メタで、calculateScore の出力には現れない
  assertEquals("lineMetadata" in before, false);
});

Deno.test(
  "スコア寄与: 参照されない lineMetadata フィールド（dialogue/meta/non-terminal/narrative の非参照集計）は score を動かさない",
  () => {
    // 参照フィールド (narrative.charCount/lineCount/short14) を両者で同一に保ち、
    // 非参照フィールドだけを派手に膨らませて score が一致することを固定する。
    const referenced = { lineCount: 100, charCount: 8000, short14: 10 };
    const baseMeta = makeLineMetadata({ narrative: makeNarrative(referenced) });
    const noisyMeta = makeLineMetadata({
      totalLines: 999,
      totalChars: 99999,
      blankCount: 500,
      separatorCount: 20,
      narrative: makeNarrative({
        ...referenced,
        short20: 60,
        short30: 80,
        chunkCount: 150,
        shortChunk14: 40,
        shortChunk20: 90,
        shortChunk30: 120,
      }),
      dialogue: makeCategory({ lineCount: 300, charCount: 5000, short14: 200, short20: 250 }),
      meta: makeCategory({ lineCount: 50, charCount: 800, short14: 40 }),
      nonTerminal: makeCategory({ lineCount: 30, charCount: 400, short14: 20 }),
    });
    const scoreBase = calculateScore(SAMPLE, baseMeta);
    const scoreWithNoise = calculateScore(SAMPLE, noisyMeta);
    assertEquals(scoreWithNoise, scoreBase, "参照されないフィールドはスコアを動かしてはならない");
  },
);

Deno.test(
  "スコア寄与: 参照される派生値（narrative.short14 / lineCount）は指定 rule 経由で score を下げる",
  () => {
    // 地の文の行数・字数を固定したまま short14 だけを増やし、grade ペナルティ経由で
    // score が下がることを固定する（ncpl 指標の寄与を両者で同一に保つため charCount も固定）。
    const calmMeta = makeLineMetadata({
      narrative: makeNarrative({ lineCount: 100, charCount: 3000, short14: 10 }),
    });
    // 100 行中 40 行が 14 字未満 → 40% で 30% 閾値超え → grade multiplier 1-(0.40-0.30)=0.90
    const firingMeta = makeLineMetadata({
      narrative: makeNarrative({ lineCount: 100, charCount: 3000, short14: 40 }),
    });
    const scoreCalm = calculateScore(SAMPLE, calmMeta);
    const scoreWithMeta = calculateScore(SAMPLE, firingMeta);

    if (!(scoreWithMeta.score < scoreCalm.score)) {
      throw new Error(
        `短行14 発火時は score が下がるはず: calm=${scoreCalm.score} with-meta=${scoreWithMeta.score}`,
      );
    }
    const short14Penalty = scoreWithMeta.penalties.find((p) => p.label === "地の文短行14 の過多");
    if (!short14Penalty) throw new Error("短行14 ペナルティが penalties に現れていない");
    assertAlmostEquals(short14Penalty.multiplier, 0.90, 1e-9);
  },
);
