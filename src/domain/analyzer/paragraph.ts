import { SEPARATOR_PATTERN } from "./constants.ts";
import { standardDeviation } from "./stats.ts";

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
  return { lengths, sd: standardDeviation(lengths) };
}
