import { SEPARATOR_PATTERN_GLOBAL } from "./constants.ts";

export function countSeparators(text: string): number {
  const matches = text.match(SEPARATOR_PATTERN_GLOBAL);
  return matches ? matches.length : 0;
}
