import type { TokenData } from "../types.ts";
import { NON_CONTENT_POS } from "./constants.ts";

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
