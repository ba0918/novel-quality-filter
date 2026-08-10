import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import type { RawMetrics } from "../../src/domain/types.ts";
import { appendRecord, type DatasetRecord } from "./dataset.ts";
import { calculateScore } from "../../src/domain/scoring/mod.ts";
import { findRecord, recordToDossierMeta, renderDetailHtml, runDetail } from "./cal_detail.ts";

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

function record(workId: string, score: number, title = `作品${workId}`): DatasetRecord {
  return {
    workId,
    url: `https://kakuyomu.jp/works/${workId}`,
    title,
    author: "著者",
    reviewCount: 5,
    totalReviewPoint: 10,
    totalCharacterCount: 1000,
    openingType: "normal",
    sampledCount: 1,
    episodeUrl: `https://kakuyomu.jp/works/${workId}/episodes/1`,
    score,
    rawMetrics: raw(),
    blankLineRatio: 0,
    tags: [],
    crawledAt: "2026-08-10T00:00:00.000Z",
    siteWorkId: `kakuyomu:${workId}`,
  };
}

Deno.test("findRecord: URL/数値ID で引け、同一作品は最新スナップショットを返す", () => {
  const recs = [record("1", 10, "旧"), record("2", 20), record("1", 30, "新")];
  assertEquals(findRecord(recs, "1")?.title, "新");
  assertEquals(findRecord(recs, "https://kakuyomu.jp/works/2")?.workId, "2");
  assertEquals(findRecord(recs, "999"), undefined);
});

Deno.test("recordToDossierMeta: 表示に必要なメタだけを抜き出す", () => {
  const meta = recordToDossierMeta(record("1", 10));
  assertEquals(meta.title, "作品1");
  assertEquals(meta.reviewCount, 5);
});

Deno.test("renderDetailHtml: 保存 score でなく再計算スコアで詳細票を描く（C3/C4）", () => {
  const rec = record("1", 999); // 保存 score は毒値
  const html = renderDetailHtml(rec, false);
  assertStringIncludes(html, String(calculateScore(raw()).score));
  assertEquals(html.includes("999"), false);
  assertStringIncludes(html, "指標"); // 指標内訳
  assertStringIncludes(html, "ペナルティ");
});

Deno.test("runDetail: 未収集の作品は 1 を返す", async () => {
  const base = await Deno.makeTempDir();
  const datasetPath = join(base, "dataset.jsonl");
  try {
    await appendRecord(datasetPath, record("1", 10));
    const code = await runDetail(["999", "--out", join(base, "x.html")], {
      datasetPath,
      labelsPath: join(base, "labels.jsonl"),
    });
    assertEquals(code, 1);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("runDetail: 収集済み作品を HTML ファイルへ書き出す", async () => {
  const base = await Deno.makeTempDir();
  const datasetPath = join(base, "dataset.jsonl");
  const outPath = join(base, "detail.html");
  try {
    await appendRecord(datasetPath, record("1", 10));
    const code = await runDetail(["1", "--out", outPath], {
      datasetPath,
      labelsPath: join(base, "labels.jsonl"),
    });
    assertEquals(code, 0);
    assertStringIncludes(await Deno.readTextFile(outPath), "作品1");
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});
