import { initTokenizer } from "../src/domain/tokenizer/mod.ts";

const path = Deno.args[0];
const text = await Deno.readTextFile(path);
await initTokenizer();

const sentences = text.split(/。/).map((s) => s.trim()).filter((s) => s.length > 0);
const lengths = sentences.map((s) => s.replace(/[\s　\n]/g, "").length);

console.log("=== 文の長さの推移 ===");
console.log("(棒グラフ: 1文字 = 1つの █)");
console.log("");

const SHORT_THRESHOLD = 15;
const shortBursts: number[] = [];
let currentGap = 0;

for (let i = 0; i < lengths.length; i++) {
  const len = lengths[i];
  const isShort = len <= SHORT_THRESHOLD;
  const bar = "█".repeat(Math.min(len, 60));
  const marker = isShort ? " ◀ 短文" : "";
  console.log(`${String(i + 1).padStart(3)}: ${bar} (${len})${marker}`);

  if (isShort) {
    if (currentGap > 0) shortBursts.push(currentGap);
    currentGap = 0;
  } else {
    currentGap++;
  }
}

console.log("\n=== 短文（15文字以下）の出現間隔 ===");
console.log(`短文の数: ${lengths.filter((l) => l <= SHORT_THRESHOLD).length} / ${lengths.length}`);
console.log(`出現間隔: [${shortBursts.join(", ")}]`);

if (shortBursts.length > 1) {
  const mean = shortBursts.reduce((a, b) => a + b, 0) / shortBursts.length;
  const sd = Math.sqrt(
    shortBursts.reduce((a, g) => a + (g - mean) ** 2, 0) / shortBursts.length,
  );
  const cv = mean > 0 ? sd / mean : 0;
  console.log(`平均間隔: ${mean.toFixed(2)}`);
  console.log(`間隔のSD: ${sd.toFixed(2)}`);
  console.log(`変動係数 (CV): ${cv.toFixed(3)}`);
  console.log(
    `→ CV が低い = 等間隔に出現 (AI的)、CV が高い = バースト的に出現 (人間的)`,
  );
}

console.log("\n=== 10文ごとの平均文長（局所密度の推移） ===");
const WINDOW = 10;
for (let i = 0; i + WINDOW <= lengths.length; i += WINDOW) {
  const chunk = lengths.slice(i, i + WINDOW);
  const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
  const localSD = Math.sqrt(
    chunk.reduce((a, l) => a + (l - avg) ** 2, 0) / chunk.length,
  );
  const bar = "█".repeat(Math.round(avg));
  console.log(
    `文 ${String(i + 1).padStart(3)}-${String(i + WINDOW).padStart(3)}: avg=${
      avg.toFixed(1).padStart(5)
    } SD=${localSD.toFixed(1).padStart(5)} ${bar}`,
  );
}

const windowSDs: number[] = [];
for (let i = 0; i + WINDOW <= lengths.length; i += WINDOW) {
  const chunk = lengths.slice(i, i + WINDOW);
  const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
  const localSD = Math.sqrt(
    chunk.reduce((a, l) => a + (l - avg) ** 2, 0) / chunk.length,
  );
  windowSDs.push(localSD);
}

if (windowSDs.length > 1) {
  const avgWindowSD = windowSDs.reduce((a, b) => a + b, 0) / windowSDs.length;
  const sdOfSD = Math.sqrt(
    windowSDs.reduce((a, s) => a + (s - avgWindowSD) ** 2, 0) / windowSDs.length,
  );
  console.log(`\n局所SD の平均: ${avgWindowSD.toFixed(2)}`);
  console.log(`局所SD のSD（＝バラつきのバラつき）: ${sdOfSD.toFixed(2)}`);
  console.log(
    `→ この値が低い = 全区間で同じようなバラつき（AI的均一性）`,
  );
  console.log(
    `→ この値が高い = 区間によってバラつきが違う（人間的な緩急）`,
  );
}
