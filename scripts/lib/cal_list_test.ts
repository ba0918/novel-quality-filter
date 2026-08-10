import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import type { RawMetrics } from "../../src/domain/types.ts";
import { appendRecord, type DatasetRecord } from "./dataset.ts";
import { saveLabels2, setLabel } from "./labels_store.ts";
import type { Quality } from "./labels_store.ts";
import { calculateScore } from "../../src/domain/scoring/mod.ts";
import { CANONICAL_FORMULA, EXPERIMENT_FORMULA, scoreResultFromMetrics } from "./cal_evaluate.ts";
import {
  buildComparisonRows,
  type ComparisonRow,
  renderListHtml,
  runEvaluate,
  runList,
} from "./cal_list.ts";

function raw(overrides: Partial<RawMetrics> = {}): RawMetrics {
  return {
    charCount: 3000,
    sentenceCount: 60,
    sentenceLengthSD: 12,
    singleSentParaRatio: 0.85,
    paragraphLengthSD: 20,
    separatorCount: 0,
    separatorFrequency: 0,
    ttr: 0.5,
    dialogueCount: 20,
    dialogueEndingVariety: 0.5,
    descriptionDensitySD: 0.03,
    taigendomeEntropy: 1,
    emotionDirectnessRatio: 0.04,
    logicalConnectiveDensity: 0.1,
    paragraphTransitionEntropy: 1,
    sentenceLengthBurstiness: 5,
    ...overrides,
  };
}

function record(workId: string, score: number, rawMetrics: RawMetrics): DatasetRecord {
  return {
    workId,
    url: `https://kakuyomu.jp/works/${workId}`,
    title: `作品${workId}`,
    author: "著者",
    reviewCount: 0,
    totalReviewPoint: 0,
    totalCharacterCount: 0,
    openingType: "normal",
    sampledCount: 1,
    episodeUrl: `https://kakuyomu.jp/works/${workId}/episodes/1`,
    score,
    rawMetrics,
    blankLineRatio: 0,
    tags: [],
    crawledAt: "2026-08-10T00:00:00.000Z",
    siteWorkId: `kakuyomu:${workId}`,
  };
}

Deno.test("buildComparisonRows: 保存 score でなく正本・実験式の再計算値と差分を出す（C2/C3/C8）", () => {
  const r = raw();
  const rec = record("1", 999, r); // 保存 score は毒値
  const labels = setLabel([], "kakuyomu:1", "良", "2026-08-10T00:00:00.000Z");

  const [row] = buildComparisonRows([rec], labels);
  assertEquals(row.canonicalScore, scoreResultFromMetrics(r, CANONICAL_FORMULA).score);
  assertEquals(row.experimentScore, scoreResultFromMetrics(r, EXPERIMENT_FORMULA).score);
  assertEquals(row.diff, row.experimentScore - row.canonicalScore);
  assertEquals(row.quality, "良");
  assertEquals(row.canonicalScore === 999, false);
});

Deno.test("buildComparisonRows: 実験式で良ラベルのスコアが動く（差分が識別力を持つ）", () => {
  const rec = record("1", 0, raw({ singleSentParaRatio: 0.85, sentenceLengthSD: 12 }));
  const labels = setLabel([], "kakuyomu:1", "良", "2026-08-10T00:00:00.000Z");
  const [row] = buildComparisonRows([rec], labels);
  assert(row.diff !== 0, "実験式の初期デルタで良作のスコアが正本から動く");
});

Deno.test("renderListHtml: 良/悪ラベル・正本・実験式・差分の列を持つ比較表を出す", () => {
  const rec = record("1", 0, raw());
  const labels = setLabel([], "kakuyomu:1", "良", "2026-08-10T00:00:00.000Z");
  const rows = buildComparisonRows([rec], labels);
  const html = renderListHtml(rows);
  assertStringIncludes(html, "正本");
  assertStringIncludes(html, "実験");
  assertStringIncludes(html, "差分");
  assertStringIncludes(html, "作品1");
  assertStringIncludes(html, "良");
});

Deno.test("renderListHtml: ラベルセルの文字列を HTML エスケープする（XSS防止）", () => {
  const row: ComparisonRow = {
    record: record("1", 0, raw()),
    quality: "<img src=x onerror=alert(1)>" as Quality,
    scope: "対象",
    canonicalScore: 10,
    experimentScore: 10,
    diff: 0,
  };
  const html = renderListHtml([row]);
  assertEquals(html.includes("<img src=x"), false);
  assertStringIncludes(html, "&lt;img src=x");
});

async function seed(): Promise<{ base: string; datasetPath: string; labelsPath: string }> {
  const base = await Deno.makeTempDir();
  const datasetPath = join(base, "dataset.jsonl");
  const labelsPath = join(base, "labels.jsonl");
  await appendRecord(datasetPath, record("1", 999, raw()));
  await saveLabels2(labelsPath, setLabel([], "kakuyomu:1", "良", "2026-08-10T00:00:00.000Z"));
  return { base, datasetPath, labelsPath };
}

Deno.test("runList: HTML ファイルを書き、再計算スコア（保存 score でない）を含む", async () => {
  const p = await seed();
  const outPath = join(p.base, "list.html");
  try {
    const code = await runList(["--out", outPath], {
      datasetPath: p.datasetPath,
      labelsPath: p.labelsPath,
    });
    assertEquals(code, 0);
    const html = await Deno.readTextFile(outPath);
    const recomputed = calculateScore(raw()).score;
    assertStringIncludes(html, String(recomputed));
    assertEquals(html.includes(">999<"), false);
  } finally {
    await Deno.remove(p.base, { recursive: true });
  }
});

Deno.test("runEvaluate: 再計算スコアをテキスト出力し、保存 score を使わない（C3）", async () => {
  const p = await seed();
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => lines.push(a.join(" "));
  try {
    const code = await runEvaluate([], { datasetPath: p.datasetPath, labelsPath: p.labelsPath });
    assertEquals(code, 0);
    const out = lines.join("\n");
    assertStringIncludes(out, String(calculateScore(raw()).score));
    assertEquals(out.includes("999"), false);
  } finally {
    console.log = orig;
    await Deno.remove(p.base, { recursive: true });
  }
});
