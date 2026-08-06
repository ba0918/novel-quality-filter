const WINDOW_SIZE = 10;
const MIN_WINDOWS = 3;

export function analyzeSentenceLengthBurstiness(
  text: string,
): { windowSDs: number[]; burstiness: number } {
  const sentences = text.split(/。/).map((s) => s.trim()).filter((s) => s.length > 0);
  const lengths = sentences.map((s) => s.replace(/[\s　]/g, "").length);

  if (lengths.length < WINDOW_SIZE * MIN_WINDOWS) {
    return { windowSDs: [], burstiness: 0 };
  }

  const windowSDs: number[] = [];
  for (let i = 0; i + WINDOW_SIZE <= lengths.length; i += WINDOW_SIZE) {
    const chunk = lengths.slice(i, i + WINDOW_SIZE);
    const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;
    const variance = chunk.reduce((a, l) => a + (l - mean) ** 2, 0) / chunk.length;
    windowSDs.push(Math.sqrt(variance));
  }

  if (windowSDs.length <= 1) {
    return { windowSDs, burstiness: 0 };
  }

  const meanSD = windowSDs.reduce((a, b) => a + b, 0) / windowSDs.length;
  const varianceOfSD = windowSDs.reduce((a, s) => a + (s - meanSD) ** 2, 0) / windowSDs.length;

  return { windowSDs, burstiness: Math.sqrt(varianceOfSD) };
}
