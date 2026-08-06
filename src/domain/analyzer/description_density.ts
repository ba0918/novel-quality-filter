import type { TokenData } from "../types.ts";
import { NON_CONTENT_POS, SEPARATOR_PATTERN } from "./constants.ts";

const MODIFIER_POS = ["形容詞", "副詞"];

export function analyzeDescriptionDensity(
  text: string,
  tokenizeFn: (s: string) => TokenData[],
): { densities: number[]; meanDensity: number; sd: number } {
  const paragraphs = text.split(/\n/).filter((p) => p.trim().length > 0);
  const contentParas = paragraphs.filter((p) => !SEPARATOR_PATTERN.test(p.trim()));

  const densities: number[] = [];
  for (const para of contentParas) {
    const tokens = tokenizeFn(para);
    const contentWords = tokens.filter((t) => !NON_CONTENT_POS.includes(t.details[0]));
    const modifiers = tokens.filter((t) => MODIFIER_POS.includes(t.details[0]));
    if (contentWords.length > 0) {
      densities.push(modifiers.length / contentWords.length);
    }
  }

  if (densities.length <= 1) return { densities, meanDensity: densities[0] ?? 0, sd: 0 };
  const mean = densities.reduce((a, b) => a + b, 0) / densities.length;
  const variance = densities.reduce((a, d) => a + (d - mean) ** 2, 0) / densities.length;
  return { densities, meanDensity: mean, sd: Math.sqrt(variance) };
}
