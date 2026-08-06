import { initTokenizer, tokenize } from "../src/domain/tokenizer/mod.ts";
import { analyzeAll } from "../src/domain/analyzer/mod.ts";
import { METRIC_CONFIGS } from "../src/domain/scoring/weights.ts";
import type { RawMetrics } from "../src/domain/types.ts";

await initTokenizer();

const FIXTURES = new URL("../tests/fixtures/", import.meta.url).pathname;

async function analyze(path: string) {
  const text = await Deno.readTextFile(path);
  const tokens = tokenize(text);
  return analyzeAll(text, tokens, tokenize);
}

function scoreWith(raw: RawMetrics, m12Weight: number): number {
  const otherWeightsSum = 0.90;
  const scaleFactor = (1 - m12Weight) / otherWeightsSum;
  let totalScore = 0;
  for (const config of METRIC_CONFIGS) {
    const rawValue = raw[config.key as keyof RawMetrics] as number;
    const normalized = config.normalize(rawValue);
    const score = config.invert ? 1 - normalized : normalized;
    const weight = config.key === "sentenceLengthBurstiness"
      ? m12Weight
      : config.weight * scaleFactor;
    totalScore += score * weight * 100;
  }
  return Math.round(Math.max(0, Math.min(100, totalScore)));
}

const aiRaw = await analyze(Deno.args[0]);
const humanRaw = await analyze(Deno.args[1]);
const hq01Raw = await analyze(FIXTURES + "high-quality-01.txt");
const lq01Raw = await analyze(FIXTURES + "low-quality-01.txt");

console.log("| M12重み | AI | 人間 | HQ-01 | LQ-01 | AI<=40? | HQ>=70? | LQ<=40? |");
console.log("|---------|-----|------|-------|-------|---------|---------|---------|");

for (const w of [0.10, 0.15, 0.20, 0.25, 0.30, 0.35]) {
  const ai = scoreWith(aiRaw, w);
  const human = scoreWith(humanRaw, w);
  const hq = scoreWith(hq01Raw, w);
  const lq = scoreWith(lq01Raw, w);
  console.log(
    `| ${w.toFixed(2)}    | ${String(ai).padStart(3)} | ${String(human).padStart(4)} | ${
      String(hq).padStart(5)
    } | ${String(lq).padStart(5)} | ${ai <= 40 ? "✅" : "❌"}      | ${
      hq >= 70 ? "✅" : "❌"
    }      | ${lq <= 40 ? "✅" : "❌"}      |`,
  );
}
