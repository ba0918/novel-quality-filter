import { splitSentences } from "./sentences.ts";
import { standardDeviation } from "./stats.ts";

export function analyzeSentenceLengths(text: string): { lengths: number[]; sd: number } {
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => s.replace(/[\s　]/g, "").length);
  return { lengths, sd: standardDeviation(lengths) };
}
