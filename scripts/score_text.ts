import { initTokenizer, tokenize } from "../src/domain/tokenizer/mod.ts";
import { analyzeAll } from "../src/domain/analyzer/mod.ts";
import { calculateScore } from "../src/domain/scoring/mod.ts";

const path = Deno.args[0];
if (!path) {
  console.error("Usage: deno run --allow-all scripts/score_text.ts <file>");
  Deno.exit(1);
}

const text = await Deno.readTextFile(path);
await initTokenizer();
const tokens = tokenize(text);
const raw = analyzeAll(text, tokens, tokenize);
const { score, metrics } = calculateScore(raw);

console.log(`\n=== スコアリング結果 ===`);
console.log(`総合スコア: ${score}/100`);
console.log(`閾値: 40 (これ以下が低品質判定)`);
console.log(`判定: ${score <= 40 ? "❌ 低品質" : "✅ 品質良好"}`);
console.log(`\n--- メトリクス詳細 ---`);
for (const m of metrics) {
  const flag = m.flagged ? " ⚠️" : "";
  console.log(
    `  ${m.label}: raw=${m.rawValue.toFixed(4)} → score=${
      m.normalizedValue.toFixed(3)
    } × w=${m.weight} = ${m.contribution.toFixed(2)}${flag}`,
  );
  if (m.flagged && m.reason) console.log(`    → ${m.reason}`);
}
