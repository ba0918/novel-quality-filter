import { assertEquals } from "@std/assert";
import type { RawMetrics } from "../types.ts";
import { calculateScore } from "./mod.ts";
import { aggregateLineMetadata } from "../analyzer/line_metadata.ts";

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

Deno.test("スコア非干渉: lineMetadata の算出は calculateScore の入力・出力に影響しない", () => {
  const before = calculateScore(SAMPLE);
  // 別経路の行メタデータ集計を挟んでも共有状態を汚さないことを確認する
  aggregateLineMetadata([{ text: "静かな朝だった。", isBlank: false }]);
  const after = calculateScore(SAMPLE);

  assertEquals(after, before);
  // 行メタデータの添付は score-handler の責務であり、calculateScore の出力には現れない
  assertEquals("lineMetadata" in before, false);
});
