import type { TokenData } from "../types.ts";
import { NON_CONTENT_POS } from "./constants.ts";

export function analyzeTaigendome(
  text: string,
  tokenizeFn: (s: string) => TokenData[],
): { count: number; total: number; ratio: number; entropy: number } {
  const sentences = text.split(/。/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return { count: 0, total: 0, ratio: 0, entropy: 0 };

  const SEGMENT_COUNT = 4;
  const segmentSize = Math.max(1, Math.ceil(sentences.length / SEGMENT_COUNT));
  const segmentTaigendome = new Array(SEGMENT_COUNT).fill(0);
  const segmentTotal = new Array(SEGMENT_COUNT).fill(0);
  let totalTaigendome = 0;

  for (let i = 0; i < sentences.length; i++) {
    const segIdx = Math.min(Math.floor(i / segmentSize), SEGMENT_COUNT - 1);
    segmentTotal[segIdx]++;
    const tokens = tokenizeFn(sentences[i].trim());
    const substantive = tokens.filter((t) => !NON_CONTENT_POS.includes(t.details[0]));
    if (substantive.length > 0 && substantive[substantive.length - 1].details[0] === "名詞") {
      totalTaigendome++;
      segmentTaigendome[segIdx]++;
    }
  }

  const segmentRatios = segmentTotal.map((total, i) =>
    total > 0 ? segmentTaigendome[i] / total : 0
  );

  const entropy = calculateEntropy(segmentRatios);

  return {
    count: totalTaigendome,
    total: sentences.length,
    ratio: sentences.length > 0 ? totalTaigendome / sentences.length : 0,
    entropy,
  };
}

function calculateEntropy(distribution: number[]): number {
  const nonZero = distribution.filter((v) => v > 0);
  if (nonZero.length === 0) return 0;
  const sum = nonZero.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const normalized = nonZero.map((v) => v / sum);
  return -normalized.reduce((acc, p) => acc + p * Math.log2(p), 0);
}
