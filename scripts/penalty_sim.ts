import { initTokenizer, tokenize } from "../src/domain/tokenizer/mod.ts";
import { analyzeAll } from "../src/domain/analyzer/mod.ts";
import { calculateScore } from "../src/domain/scoring/mod.ts";
import type { RawMetrics as _RawMetrics } from "../src/domain/types.ts";

await initTokenizer();

const FIXTURES = new URL("../tests/fixtures/", import.meta.url).pathname;

interface PenaltyRule {
  key: string;
  criticalThreshold: number;
  penaltyMultiplier: number;
}

async function analyzeFile(path: string) {
  const text = await Deno.readTextFile(path);
  const tokens = tokenize(text);
  const raw = analyzeAll(text, tokens, tokenize);
  const { score, metrics } = calculateScore(raw);
  return { score, metrics, raw };
}

function applyPenalty(
  baseScore: number,
  metrics: { key: string; normalizedValue: number }[],
  rules: PenaltyRule[],
): { finalScore: number; penalties: string[] } {
  let multiplier = 1.0;
  const penalties: string[] = [];
  for (const rule of rules) {
    const m = metrics.find((m) => m.key === rule.key);
    if (m && m.normalizedValue < rule.criticalThreshold) {
      multiplier *= rule.penaltyMultiplier;
      penalties.push(`${rule.key}: ${m.normalizedValue.toFixed(3)} < ${rule.criticalThreshold}`);
    }
  }
  return {
    finalScore: Math.round(baseScore * multiplier),
    penalties,
  };
}

const ai = await analyzeFile(Deno.args[0]);
const human = await analyzeFile(Deno.args[1]);
const hq01 = await analyzeFile(FIXTURES + "high-quality-01.txt");
const lq01 = await analyzeFile(FIXTURES + "low-quality-01.txt");

const datasets = [
  { name: "AI sample", ...ai },
  { name: "人間sample", ...human },
  { name: "HQ-01", ...hq01 },
  { name: "LQ-01", ...lq01 },
];

const scenarios: { name: string; rules: PenaltyRule[] }[] = [
  {
    name: "M12のみ (閾値0.5, ×0.6)",
    rules: [{ key: "sentenceLengthBurstiness", criticalThreshold: 0.5, penaltyMultiplier: 0.6 }],
  },
  {
    name: "M12のみ (閾値0.5, ×0.5)",
    rules: [{ key: "sentenceLengthBurstiness", criticalThreshold: 0.5, penaltyMultiplier: 0.5 }],
  },
  {
    name: "M12+M2 (×0.7, ×0.8)",
    rules: [
      { key: "sentenceLengthBurstiness", criticalThreshold: 0.5, penaltyMultiplier: 0.7 },
      { key: "sentenceLengthSD", criticalThreshold: 0.5, penaltyMultiplier: 0.8 },
    ],
  },
  {
    name: "M12+M2+M4 (×0.7, ×0.8, ×0.8)",
    rules: [
      { key: "sentenceLengthBurstiness", criticalThreshold: 0.5, penaltyMultiplier: 0.7 },
      { key: "sentenceLengthSD", criticalThreshold: 0.5, penaltyMultiplier: 0.8 },
      { key: "dialogueEndingVariety", criticalThreshold: 0.4, penaltyMultiplier: 0.8 },
    ],
  },
];

for (const scenario of scenarios) {
  console.log(`\n=== ${scenario.name} ===`);
  for (const d of datasets) {
    const { finalScore, penalties } = applyPenalty(d.score, d.metrics, scenario.rules);
    const ok = d.name.includes("LQ") || d.name.includes("AI")
      ? (finalScore <= 40 ? "✅" : "❌")
      : (finalScore >= 70 ? "✅" : (finalScore >= 50 ? "⚠️" : "❌"));
    const penaltyStr = penalties.length > 0 ? ` [${penalties.join("; ")}]` : " [ペナルティなし]";
    console.log(
      `  ${d.name.padEnd(12)}: ${d.score} → ${String(finalScore).padStart(2)} ${ok}${penaltyStr}`,
    );
  }
}
