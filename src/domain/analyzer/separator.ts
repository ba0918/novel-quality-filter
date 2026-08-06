const SEPARATOR_PATTERN = /^[\s]*(---|＊＊＊|\*\*\*|───|——|━━)[\s]*$/gm;

export function countSeparators(text: string): number {
  const matches = text.match(SEPARATOR_PATTERN);
  return matches ? matches.length : 0;
}

export function separatorFrequency(text: string): {
  count: number;
  sentenceCount: number;
  frequency: number;
} {
  const count = countSeparators(text);
  const sentences = text.split(/。/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;
  return {
    count,
    sentenceCount,
    frequency: sentenceCount > 0 ? count / sentenceCount : 0,
  };
}
