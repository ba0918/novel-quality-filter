import { initTokenizer, tokenize } from "../src/domain/tokenizer/mod.ts";
import { analyzeAll } from "../src/domain/analyzer/mod.ts";
import { METRIC_CONFIGS, PENALTY_RULES } from "../src/domain/scoring/weights.ts";
import type { RawMetrics } from "../src/domain/types.ts";

await initTokenizer();

const FIXTURES = new URL("../tests/fixtures/", import.meta.url).pathname;

async function getRaw(path: string): Promise<RawMetrics> {
  const text = await Deno.readTextFile(path);
  const tokens = tokenize(text);
  return analyzeAll(text, tokens, tokenize);
}

function scoreWith(raw: RawMetrics, m1Weight: number): number {
  const currentM1Weight = 0.22;
  const otherScale = (1 - m1Weight) / (1 - currentM1Weight);

  const metrics = METRIC_CONFIGS.map((config) => {
    const rawValue = raw[config.key as keyof RawMetrics] as number;
    const normalized = config.normalize(rawValue);
    const score = config.invert ? 1 - normalized : normalized;
    const weight = config.key === "singleSentParaRatio" ? m1Weight : config.weight * otherScale;
    return { key: config.key, normalizedValue: score, weight, contribution: score * weight * 100 };
  });

  const baseScore = Math.max(0, Math.min(100, metrics.reduce((s, m) => s + m.contribution, 0)));

  let penalty = 1.0;
  for (const rule of PENALTY_RULES) {
    let allMet = true;
    for (const cond of rule.conditions) {
      const rv = raw[cond.key as keyof RawMetrics] as number;
      if (cond.exemptWhenZero && rv === 0) {
        allMet = false;
        break;
      }
      const m = metrics.find((m) => m.key === cond.key);
      const threshold = cond.key === "singleSentParaRatio" ? 0.30 : cond.criticalThreshold;
      if (!m || m.normalizedValue >= threshold) {
        allMet = false;
        break;
      }
    }
    if (allMet) penalty *= rule.penaltyMultiplier;
  }

  return Math.round(baseScore * penalty);
}

const samples = [
  { name: "HQ-01 fixture", raw: await getRaw(FIXTURES + "high-quality-01.txt"), want: ">=70" },
  { name: "LQ-01 fixture", raw: await getRaw(FIXTURES + "low-quality-01.txt"), want: "<=40" },
  { name: "AI（洗練）   ", raw: await getRaw(Deno.args[0]), want: "<=40" },
  { name: "人間（楽しい）", raw: await getRaw(Deno.args[1]), want: ">=70" },
  { name: "回避サンプル  ", raw: await getRaw(Deno.args[2]), want: "<=40" },
  { name: "暴落（守る）  ", raw: await getRaw(Deno.args[3]), want: ">=50" },
  { name: "AI上手く使う  ", raw: await getRaw(Deno.args[4]), want: ">=50" },
  { name: "AI補助（笑）  ", raw: await getRaw(Deno.args[5]), want: "<=40" },
];

console.log(`| M1重み | ${samples.map((s) => s.name.trim().padEnd(8)).join(" | ")} |`);
console.log(`|--------|${samples.map(() => "----------").join("|")}|`);

for (const w of [0.22, 0.25, 0.28, 0.30]) {
  const scores = samples.map((s) => {
    const score = scoreWith(s.raw, w);
    const ok = s.want.startsWith(">=")
      ? score >= parseInt(s.want.slice(2))
      : score <= parseInt(s.want.slice(2));
    return `${String(score).padStart(3)} ${ok ? "✅" : "❌"}`;
  });
  console.log(`| ${w.toFixed(2)}   | ${scores.join("  | ")} |`);
}
