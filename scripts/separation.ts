// deno task separation: 行メタ3指標 × 品質ラベルの分離度と、現行スコア×ユーザー判定の
// 食い違い（通過駄文/巻き込み良作）を出力する。対象外・論理除外・旧形式は分離から外し、
// 外した件数を必ず表示する（暗黙の間引き禁止）。作者/bodyHash の跨りは交絡/リーク警告として出す。
//
// Usage: deno task separation [--in PATH] [--labels PATH] [--threshold N]

import { loadDataset } from "./lib/dataset.ts";
import { loadLabels2 } from "./lib/labels_store.ts";
import { analyzeSeparation, type JoinedRecord } from "./lib/analyze_separation.ts";

const DEFAULT_IN = ".agents/runtime/dataset.jsonl";
const DEFAULT_LABELS = ".agents/runtime/labels.jsonl";
const DEFAULT_THRESHOLD = 40;

function argValue(flag: string, fallback: string): string {
  const i = Deno.args.indexOf(flag);
  return i >= 0 && i + 1 < Deno.args.length ? Deno.args[i + 1] : fallback;
}

function line(j: JoinedRecord): string {
  return `  ${j.record.score} ${j.record.title.slice(0, 28)}\n    ${j.record.url}`;
}

async function main(): Promise<void> {
  const records = await loadDataset(argValue("--in", DEFAULT_IN));
  const labels = await loadLabels2(argValue("--labels", DEFAULT_LABELS));
  const threshold = Number(argValue("--threshold", String(DEFAULT_THRESHOLD)));

  const r = analyzeSeparation(records, labels, threshold);

  console.log(
    `データセット ${records.length}件 / ラベル ${labels.length}件（閾値 ${threshold}）\n`,
  );
  console.log(`分離対象: 良 ${r.goodCount} / ゴミ ${r.junkCount}（計 ${r.eligibleCount}）`);
  console.log(
    `分離から除外: 対象外 ${r.scopeExcludedCount} / 論理除外 ${r.logicallyExcludedCount} / 旧形式 ${r.legacyExcludedCount}\n`,
  );

  console.log("=== 行メタ3指標 × 品質ラベルの分離度（良平均 vs ゴミ平均 / 差）===");
  for (const m of r.metrics) {
    console.log(
      `  ${m.key.padEnd(26)} 良 ${m.goodMean.toFixed(2)} / ゴミ ${m.junkMean.toFixed(2)} / 差 ${
        m.gap.toFixed(2)
      }`,
    );
  }

  console.log(
    `\n=== 通過駄文（現行スコアで通過だがユーザーはゴミ）: ${r.mismatches.passedJunk.length}件 ===`,
  );
  for (const j of r.mismatches.passedJunk) console.log(line(j));
  console.log(
    `\n=== 巻き込み良作（現行スコアで除外だがユーザーは良）: ${r.mismatches.caughtGood.length}件 ===`,
  );
  for (const j of r.mismatches.caughtGood) console.log(line(j));

  if (r.leakage.length > 0) {
    console.log(`\n=== 交絡/リーク警告（アンカーと広域の跨り）: ${r.leakage.length}件 ===`);
    for (const w of r.leakage) {
      console.log(`  [${w.kind}] ${w.value}: ${w.works.join(", ")}`);
    }
  }
}

await main();
