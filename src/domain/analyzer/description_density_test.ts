import { assertEquals } from "@std/assert";
import type { TokenData } from "../types.ts";
import { analyzeDescriptionDensity } from "./description_density.ts";

function tokenize(entries: [string, string][]): (s: string) => TokenData[] {
  return () => entries.map(([surface, pos]) => ({ surface, details: [pos] }));
}

Deno.test("description_density: empty text returns zero", () => {
  const result = analyzeDescriptionDensity("", tokenize([]));
  assertEquals(result.densities.length, 0);
  assertEquals(result.sd, 0);
});

Deno.test("description_density: single paragraph has zero SD", () => {
  const text = "赤い花が咲く。";
  const result = analyzeDescriptionDensity(
    text,
    tokenize([
      ["赤い", "形容詞"],
      ["花", "名詞"],
      ["が", "助詞"],
      ["咲く", "動詞"],
      ["。", "記号"],
    ]),
  );
  assertEquals(result.densities.length, 1);
  assertEquals(result.sd, 0);
});

Deno.test("description_density: paragraphs with differing modifier ratios have SD", () => {
  const text = "赤い花が咲く。\n彼は歩く。";
  const result = analyzeDescriptionDensity(text, (s) => {
    if (s.includes("赤い")) {
      return [
        { surface: "赤い", details: ["形容詞"] },
        { surface: "花", details: ["名詞"] },
        { surface: "が", details: ["助詞"] },
        { surface: "咲く", details: ["動詞"] },
        { surface: "。", details: ["記号"] },
      ];
    }
    return [
      { surface: "彼", details: ["名詞"] },
      { surface: "は", details: ["助詞"] },
      { surface: "歩く", details: ["動詞"] },
      { surface: "。", details: ["記号"] },
    ];
  });
  assertEquals(result.densities.length, 2);
  assertEquals(result.densities[0], 0.25);
  assertEquals(result.densities[1], 0);
  assertEquals(result.sd > 0, true);
});

Deno.test("description_density: separator lines are excluded", () => {
  const text = "赤い花が咲く。\n---\n彼は歩く。";
  const result = analyzeDescriptionDensity(
    text,
    tokenize([
      ["赤い", "形容詞"],
      ["花", "名詞"],
      ["が", "助詞"],
      ["咲く", "動詞"],
      ["。", "記号"],
    ]),
  );
  assertEquals(result.densities.length, 2);
});
