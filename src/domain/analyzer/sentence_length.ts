export function analyzeSentenceLengths(text: string): { lengths: number[]; sd: number } {
  const sentences = text.split(/。/).map((s) => s.trim()).filter((s) => s.length > 0);
  const lengths = sentences.map((s) => s.replace(/[\s　]/g, "").length);
  if (lengths.length <= 1) return { lengths, sd: 0 };
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / lengths.length;
  return { lengths, sd: Math.sqrt(variance) };
}
