import type { TokenData } from "../types.ts";

const NON_CONTENT_POS = ["記号", "空白", "BOS/EOS"];

export function analyzeVocabularyDiversity(
  tokens: TokenData[],
): { uniqueCount: number; totalCount: number; ttr: number } {
  const contentWords = tokens.filter((t) => !NON_CONTENT_POS.includes(t.details[0]));
  const surfaces = contentWords.map((t) => t.surface);
  const uniqueSurfaces = new Set(surfaces);
  return {
    uniqueCount: uniqueSurfaces.size,
    totalCount: surfaces.length,
    ttr: surfaces.length > 0 ? uniqueSurfaces.size / surfaces.length : 0,
  };
}
