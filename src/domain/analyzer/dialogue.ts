import type { TokenData } from "../types.ts";

const NON_CONTENT_POS = ["記号", "空白", "BOS/EOS"];

export function analyzeDialogues(
  text: string,
  tokenizeFn: (s: string) => TokenData[],
): { count: number; endings: string[]; variety: number } {
  const dialogues = text.match(/「[^」]+」/g) ?? [];
  const endings: string[] = [];

  for (const d of dialogues) {
    const inner = d.slice(1, -1);
    const tokens = tokenizeFn(inner);
    const meaningful = tokens.filter((t) => !NON_CONTENT_POS.includes(t.details[0]));
    if (meaningful.length > 0) {
      const last = meaningful[meaningful.length - 1];
      endings.push(`${last.details[0]}/${last.details[1]}`);
    }
  }

  const uniqueEndings = new Set(endings);
  const variety = endings.length > 0 ? uniqueEndings.size / endings.length : 0;
  return { count: dialogues.length, endings, variety };
}
