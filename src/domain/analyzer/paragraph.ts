const SEPARATOR_PATTERN = /^[\s]*(---|＊＊＊|\*\*\*|───|——|━━)[\s]*$/;

export function analyzeSingleSentParagraphs(
  text: string,
): { total: number; singleSent: number; ratio: number } {
  const paragraphs = text.split(/\n/).filter((p) => p.trim().length > 0);
  const contentParas = paragraphs.filter((p) => !SEPARATOR_PATTERN.test(p.trim()));
  let singleSent = 0;
  for (const p of contentParas) {
    const trimmed = p.trim();
    if (trimmed.startsWith("「") && trimmed.endsWith("」")) continue;
    const sentCount = (trimmed.match(/。/g) || []).length;
    if (sentCount <= 1) singleSent++;
  }
  return {
    total: contentParas.length,
    singleSent,
    ratio: contentParas.length > 0 ? singleSent / contentParas.length : 0,
  };
}

export function analyzeParagraphLengths(text: string): { lengths: number[]; sd: number } {
  const paragraphs = text.split(/\n/).filter((p) => p.trim().length > 0);
  const contentParas = paragraphs.filter((p) => !SEPARATOR_PATTERN.test(p.trim()));
  const lengths = contentParas.map((p) => p.trim().replace(/[\s　]/g, "").length);
  if (lengths.length <= 1) return { lengths, sd: 0 };
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / lengths.length;
  return { lengths, sd: Math.sqrt(variance) };
}
