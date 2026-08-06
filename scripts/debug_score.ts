import { initTokenizer, tokenize } from "../src/domain/tokenizer/mod.ts";
import { analyzeAll } from "../src/domain/analyzer/mod.ts";
import { calculateScore } from "../src/domain/scoring/mod.ts";

await initTokenizer();

for (const name of ["high-quality-01.txt", "low-quality-01.txt"]) {
  const text = await Deno.readTextFile(`tests/fixtures/${name}`);
  const tokens = tokenize(text);
  const raw = analyzeAll(text, tokens, tokenize);
  const result = calculateScore(raw);

  console.log(`\n=== ${name} (score: ${result.score}) ===`);
  for (const m of result.metrics) {
    const flag = m.flagged ? "⚠️" : "✅";
    console.log(
      `  ${m.label.padEnd(20)} raw=${String(m.rawValue.toFixed(3)).padStart(7)} norm=${
        String(m.normalizedValue.toFixed(3)).padStart(6)
      } contrib=${String(m.contribution.toFixed(1)).padStart(5)} ${flag}`,
    );
  }
}
