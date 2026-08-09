import type { TokenData } from "../types.ts";
import { MENTAL_VERBS, SENSORY_WORDS, SEPARATOR_PATTERN } from "./constants.ts";
import { extractNarrative } from "./narrative.ts";

export type ParagraphType = "D" | "I" | "N" | "A";

export function classifyParagraph(
  text: string,
  tokenizeFn: (s: string) => TokenData[],
): ParagraphType {
  const trimmed = text.trim();
  const dialogueMatches = trimmed.match(/「[^」]*」/g) ?? [];
  const dialogueChars = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
  if (dialogueChars / trimmed.length >= 0.5) return "D";

  const narrative = extractNarrative(trimmed);
  const tokens = tokenizeFn(narrative);

  for (const token of tokens) {
    const baseForm = token.details[6] ?? token.surface;
    if (token.details[0] === "動詞" && MENTAL_VERBS.has(baseForm)) return "I";
  }

  let sensoryCount = 0;
  for (const token of tokens) {
    if (SENSORY_WORDS.has(token.surface)) {
      sensoryCount++;
      if (sensoryCount >= 2) return "N";
    }
  }

  return "A";
}

export function analyzeParagraphTransitions(
  text: string,
  tokenizeFn: (s: string) => TokenData[],
): { types: ParagraphType[]; entropy: number } {
  const paragraphs = text.split(/\n/).filter((p) => p.trim().length > 0);
  const contentParas = paragraphs.filter(
    (p) => !SEPARATOR_PATTERN.test(p.trim()),
  );

  if (contentParas.length <= 2) {
    return { types: [], entropy: 0 };
  }

  const types = contentParas.map((p) => classifyParagraph(p, tokenizeFn));

  const transitionCounts = new Map<string, Map<string, number>>();
  for (let i = 0; i < types.length - 1; i++) {
    const from = types[i];
    const to = types[i + 1];
    if (!transitionCounts.has(from)) {
      transitionCounts.set(from, new Map());
    }
    const fromMap = transitionCounts.get(from)!;
    fromMap.set(to, (fromMap.get(to) ?? 0) + 1);
  }

  let totalEntropy = 0;
  let totalTransitions = 0;

  for (const [, toMap] of transitionCounts) {
    const fromTotal = Array.from(toMap.values()).reduce((a, b) => a + b, 0);
    let fromEntropy = 0;
    for (const count of toMap.values()) {
      const p = count / fromTotal;
      if (p > 0) fromEntropy -= p * Math.log2(p);
    }
    totalEntropy += fromEntropy * fromTotal;
    totalTransitions += fromTotal;
  }

  const entropy = totalTransitions > 0 ? totalEntropy / totalTransitions : 0;
  return { types, entropy };
}
