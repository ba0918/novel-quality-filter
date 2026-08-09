import type { TokenData } from "../types.ts";
import { EMOTION_ADJECTIVES, EMOTION_NOUNS, MENTAL_VERBS, NON_CONTENT_POS } from "./constants.ts";
import { extractNarrative } from "./narrative.ts";

function isEmotionToken(token: TokenData): boolean {
  const pos = token.details[0];
  const baseForm = token.details[6] ?? token.surface;
  if (pos === "形容詞" && EMOTION_ADJECTIVES.has(baseForm)) return true;
  if (pos === "名詞" && EMOTION_NOUNS.has(token.surface)) return true;
  if (pos === "動詞" && MENTAL_VERBS.has(baseForm)) return true;
  return false;
}

export function analyzeEmotionDirectness(
  text: string,
  tokenizeFn: (s: string) => TokenData[],
): { emotionCount: number; contentCount: number; ratio: number } {
  const narrative = extractNarrative(text);
  if (narrative.trim().length === 0) {
    return { emotionCount: 0, contentCount: 0, ratio: 0 };
  }
  const tokens = tokenizeFn(narrative);
  const contentTokens = tokens.filter(
    (t) => !NON_CONTENT_POS.includes(t.details[0]),
  );
  const emotionTokens = contentTokens.filter(isEmotionToken);
  return {
    emotionCount: emotionTokens.length,
    contentCount: contentTokens.length,
    ratio: contentTokens.length > 0 ? emotionTokens.length / contentTokens.length : 0,
  };
}
