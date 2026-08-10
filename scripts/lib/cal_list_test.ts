import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import type { RawMetrics } from "../../src/domain/types.ts";
import { appendRecord, type DatasetRecord } from "./dataset.ts";
import { saveLabels2, setLabel, toggleTag } from "./labels_store.ts";
import { calculateScore } from "../../src/domain/scoring/mod.ts";
import { CANONICAL_FORMULA, EXPERIMENT_FORMULA, scoreResultFromMetrics } from "./cal_evaluate.ts";
import { buildCalJson, buildComparisonRows, labelsFor, runEvaluate, runList } from "./cal_list.ts";

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
    reviewCount: 3,
    totalReviewPoint: 7,
    totalCharacterCount: 12345,
    openingType: "normal",
    sampledCount: 1,
    episodeUrl: `https://kakuyomu.jp/works/${workId}/episodes/1`,
    score,
    rawMetrics,
    blankLineRatio: 0,
    tags: ["異世界"],
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

Deno.test("labelsFor: ラベル未設定は空配列", () => {
  assertEquals(labelsFor(undefined), []);
});

Deno.test("labelsFor: quality・tags を横並びの文字列配列にする", () => {
  let labels = setLabel([], "kakuyomu:1", "良", "2026-08-10T00:00:00.000Z");
  labels = toggleTag(labels, "kakuyomu:1", "+テンプレ", "2026-08-10T00:00:00.000Z");
  const [rec] = labels;
  assertEquals(labelsFor(rec), ["良", "テンプレ"]);
});

Deno.test("labelsFor: 対象外は scope マーカーを含む", () => {
  const labels = setLabel([], "kakuyomu:1", "対象外", "2026-08-10T00:00:00.000Z");
  const [rec] = labels;
  assertEquals(labelsFor(rec), ["対象外"]);
});

Deno.test("buildCalJson: generatedAt / weightsRef / works を持つトップレベル構造を返す", () => {
  const rec = record("1", 999, raw());
  const labels = setLabel([], "kakuyomu:1", "良", "2026-08-10T00:00:00.000Z");
  const calJson = buildCalJson([rec], labels, "2026-08-10T14:38:32+09:00");

  assertEquals(calJson.generatedAt, "2026-08-10T14:38:32+09:00");
  assertEquals(calJson.canonicalWeightsRef, "src/domain/scoring/weights.ts");
  assertEquals(calJson.experimentWeightsRef, "src/domain/scoring/weights_experiment.ts");
  assertEquals(calJson.works.length, 1);
});

Deno.test("buildCalJson: works[] の各要素が識別子・meta・rawMetrics・canonical/experiment・diff を持つ", () => {
  const r = raw();
  const rec = record("42", 999, r); // 保存 score は毒値
  const labels = setLabel([], "kakuyomu:42", "良", "2026-08-10T00:00:00.000Z");
  const [work] = buildCalJson([rec], labels).works;

  assertEquals(work.siteWorkId, "kakuyomu:42");
  assertEquals(work.workId, "42");
  assertEquals(work.site, "kakuyomu");
  assertEquals(work.url, rec.url);
  assertEquals(work.episodeUrl, rec.episodeUrl);
  assertEquals(work.title, "作品42");
  assertEquals(work.author, "著者");
  assertEquals(work.labels, ["良"]);
  assertEquals(work.rawMetrics, r);

  const canonicalExpected = scoreResultFromMetrics(r, CANONICAL_FORMULA);
  const experimentExpected = scoreResultFromMetrics(r, EXPERIMENT_FORMULA);
  assertEquals(work.canonical.score, canonicalExpected.score);
  assertEquals(work.canonical.metrics, canonicalExpected.metrics);
  assertEquals(work.canonical.penalties, canonicalExpected.penalties);
  assertEquals(work.experiment.score, experimentExpected.score);
  assertEquals(work.diff, experimentExpected.score - canonicalExpected.score);
  assertEquals(work.canonical.score === 999, false);
});

Deno.test("buildCalJson: meta は DatasetRecord 由来のフィールドだけを持つ（crawler拡張項目は含まない）", () => {
  const rec = record("1", 0, raw());
  const [work] = buildCalJson([rec], []).works;

  assertEquals(work.meta, {
    reviewCount: 3,
    totalReviewPoint: 7,
    totalCharacterCount: 12345,
    openingType: "normal",
    sampledCount: 1,
    seedTags: ["異世界"],
    crawledAt: "2026-08-10T00:00:00.000Z",
  });
  assertEquals(
    Object.keys(work.meta).sort(),
    [
      "crawledAt",
      "openingType",
      "reviewCount",
      "sampledCount",
      "seedTags",
      "totalCharacterCount",
      "totalReviewPoint",
    ].sort(),
  );
});

Deno.test("buildCalJson: lineMetadata が record にあれば works[] に渡る", () => {
  const rec: DatasetRecord = {
    ...record("1", 0, raw()),
    lineMetadata: {
      totalLines: 10,
      totalChars: 200,
      blankCount: 1,
      separatorCount: 0,
      narrative: {
        lineCount: 4,
        charCount: 100,
        short20: 1,
        short30: 2,
        chunkCount: 5,
        shortChunk20: 1,
        shortChunk30: 2,
      },
      dialogue: { lineCount: 3, charCount: 60, short20: 0, short30: 1 },
      meta: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
      nonTerminal: { lineCount: 2, charCount: 40, short20: 0, short30: 0 },
    },
  };
  const [work] = buildCalJson([rec], []).works;
  assertEquals(work.lineMetadata, rec.lineMetadata);
});

async function seed(): Promise<{ base: string; datasetPath: string; labelsPath: string }> {
  const base = await Deno.makeTempDir();
  const datasetPath = join(base, "dataset.jsonl");
  const labelsPath = join(base, "labels.jsonl");
  await appendRecord(datasetPath, record("1", 999, raw()));
  await saveLabels2(labelsPath, setLabel([], "kakuyomu:1", "良", "2026-08-10T00:00:00.000Z"));
  return { base, datasetPath, labelsPath };
}

Deno.test("runList: cal.json を指定 distDir に書き、再計算スコア（保存 score でない）を含む", async () => {
  const p = await seed();
  const distDir = join(p.base, "dist");
  try {
    const code = await runList(
      [],
      { datasetPath: p.datasetPath, labelsPath: p.labelsPath },
      distDir,
    );
    assertEquals(code, 0);
    const json = JSON.parse(await Deno.readTextFile(join(distDir, "cal.json")));
    const recomputed = calculateScore(raw()).score;
    assertEquals(json.works.length, 1);
    assertEquals(json.works[0].canonical.score, recomputed);
    assertEquals(json.works[0].canonical.score === 999, false);
  } finally {
    await Deno.remove(p.base, { recursive: true });
  }
});

Deno.test("runList: 未知フラグを渡すと使い方を出してエラー終了する", async () => {
  const code = await runList(["--out", "foo/"]);
  assertEquals(code === 0, false);
});

Deno.test("runList: データセットが空ならエラー終了しファイルを書かない", async () => {
  const base = await Deno.makeTempDir();
  const distDir = join(base, "dist");
  try {
    const code = await runList([], {
      datasetPath: join(base, "does-not-exist.jsonl"),
      labelsPath: join(base, "labels.jsonl"),
    }, distDir);
    assertEquals(code, 1);
    let exists = true;
    try {
      await Deno.stat(join(distDir, "cal.json"));
    } catch {
      exists = false;
    }
    assertEquals(exists, false);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("runEvaluate: 未知フラグを渡すと使い方を出してエラー終了する", async () => {
  const code = await runEvaluate(["--bogus"]);
  assertEquals(code === 0, false);
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
