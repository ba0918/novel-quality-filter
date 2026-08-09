const WINDOW_SIZE = 10;
const MIN_WINDOWS = 3;

import { splitSentences } from "./sentences.ts";
import { standardDeviation } from "./stats.ts";

export function analyzeSentenceLengthBurstiness(
  text: string,
): { windowSDs: number[]; burstiness: number } {
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => s.replace(/[\s　]/g, "").length);

  if (lengths.length < WINDOW_SIZE * MIN_WINDOWS) {
    return { windowSDs: [], burstiness: 0 };
  }

  const windowSDs: number[] = [];
  for (let i = 0; i + WINDOW_SIZE <= lengths.length; i += WINDOW_SIZE) {
    const chunk = lengths.slice(i, i + WINDOW_SIZE);
    windowSDs.push(standardDeviation(chunk));
  }

  if (windowSDs.length <= 1) {
    return { windowSDs, burstiness: 0 };
  }

  return { windowSDs, burstiness: standardDeviation(windowSDs) };
}
