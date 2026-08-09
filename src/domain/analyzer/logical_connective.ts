import { LOGICAL_CONNECTIVES } from "./constants.ts";
import { extractNarrative } from "./narrative.ts";
import { splitSentences } from "./sentences.ts";

export function analyzeLogicalConnectives(
  text: string,
): { count: number; sentenceCount: number; density: number } {
  const narrative = extractNarrative(text);
  const sentences = splitSentences(narrative);
  if (sentences.length === 0) {
    return { count: 0, sentenceCount: 0, density: 0 };
  }

  let count = 0;
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    for (const connective of LOGICAL_CONNECTIVES) {
      if (trimmed.startsWith(connective) || trimmed.includes("、" + connective)) {
        count++;
        break;
      }
    }
  }

  return {
    count,
    sentenceCount: sentences.length,
    density: count / sentences.length,
  };
}
