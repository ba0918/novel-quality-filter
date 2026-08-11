import { assertEquals } from "@std/assert";
import type { CategoryCount, LineMetadata, NarrativeCount, RawMetrics } from "../types.ts";
import { calculateScore } from "./mod.ts";
import { aggregateLineMetadata } from "../analyzer/line_metadata.ts";

// スコア寄与の契約:
//   - lineMetadata は「指定された penalty rule から参照される派生値」だけがスコアに影響する
//   - それ以外の lineMetadata フィールド（dialogue / meta / non-terminal / narrative の
//     参照されない集計）は素通しでスコアを動かさない
// 現行で参照されるのは「地の文短行14 の過多」ペナルティ経由の narrative.short14 / lineCount のみ。
// 将来 rule が増えたときはこの契約自体を書き直す（＝スコア入力の昇格を明示的に扱う）。

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
    const scoreNoMeta = calculateScore(SAMPLE);

    // narrative.lineCount と narrative.short14 だけが「地の文短行14 の過多」ペナルティの参照対象。
    // それ以外は数字を派手に変えても score に影響しないことを固定する。
    const noisyMeta = makeLineMetadata({
      totalLines: 999,
      totalChars: 99999,
      blankCount: 500,
      separatorCount: 20,
      // narrative は「非参照フィールド」だけ膨らませる（short14/lineCount は現状比率 0 を保つ）。
      narrative: makeNarrative({
        lineCount: 100,
        charCount: 8000,
        short14: 10, // 10/100 = 10% → 閾値 30% 未満で非発火
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
    const scoreWithNoise = calculateScore(SAMPLE, noisyMeta);
    assertEquals(scoreWithNoise, scoreNoMeta, "参照されないフィールドはスコアを動かしてはならない");
  },
);

Deno.test(
  "スコア寄与: 参照される派生値（narrative.short14 / lineCount）は指定 rule 経由で score を下げる",
  () => {
    const scoreNoMeta = calculateScore(SAMPLE);

    // 地の文 100 行中 40 行が 14 字未満 → 40% で 30% 閾値超え → 「地の文短行14 の過多」発火。
    const firingMeta = makeLineMetadata({
      narrative: makeNarrative({ lineCount: 100, short14: 40 }),
    });
    const scoreWithMeta = calculateScore(SAMPLE, firingMeta);

    // 参照される派生値がスコアを下げること、および指定 rule が penalties に現れることを固定。
    if (!(scoreWithMeta.score < scoreNoMeta.score)) {
      throw new Error(
        `短行14 発火時は score が下がるはず: no-meta=${scoreNoMeta.score} with-meta=${scoreWithMeta.score}`,
      );
    }
    const short14Penalty = scoreWithMeta.penalties.find((p) => p.label === "地の文短行14 の過多");
    if (!short14Penalty) throw new Error("短行14 ペナルティが penalties に現れていない");
    assertEquals(short14Penalty.multiplier, 0.85);
  },
);
