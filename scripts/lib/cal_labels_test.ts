import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { appendRecord, type DatasetRecord } from "./dataset.ts";
import { loadLabels2 } from "./labels_store.ts";
import { runExclude, runLabel, runTag } from "./cal_labels.ts";

function datasetRecord(workId: string): DatasetRecord {
  return {
    workId,
    url: `https://kakuyomu.jp/works/${workId}`,
    title: "作品",
    author: "著者",
    reviewCount: 0,
    totalReviewPoint: 0,
    totalCharacterCount: 0,
    openingType: "normal",
    sampledCount: 1,
    episodeUrl: `https://kakuyomu.jp/works/${workId}/episodes/1`,
    score: 50,
    // deno-lint-ignore no-explicit-any
    rawMetrics: {} as any,
    blankLineRatio: 0,
    tags: [],
    crawledAt: "2026-08-10T00:00:00.000Z",
    siteWorkId: `kakuyomu:${workId}`,
  };
}

async function seed(): Promise<{ datasetPath: string; labelsPath: string; base: string }> {
  const base = await Deno.makeTempDir();
  const paths = {
    base,
    datasetPath: join(base, "dataset.jsonl"),
    labelsPath: join(base, "labels.jsonl"),
  };
  await appendRecord(paths.datasetPath, datasetRecord("123"));
  return paths;
}

Deno.test("runLabel: 収集済み作品に品質ラベルを付ける", async () => {
  const p = await seed();
  try {
    const code = await runLabel(["123", "良"], p);
    assertEquals(code, 0);
    const labels = await loadLabels2(p.labelsPath);
    assertEquals(labels[0].quality, "良");
  } finally {
    await Deno.remove(p.base, { recursive: true });
  }
});

Deno.test("runLabel: 不正なラベル値は 1 を返し書き込まない", async () => {
  const p = await seed();
  try {
    const code = await runLabel(["123", "微妙"], p);
    assertEquals(code, 1);
    assertEquals(await loadLabels2(p.labelsPath), []);
  } finally {
    await Deno.remove(p.base, { recursive: true });
  }
});

Deno.test("runTag: コホートタグを付与する", async () => {
  const p = await seed();
  try {
    const code = await runTag(["123", "+すり抜け"], p);
    assertEquals(code, 0);
    const labels = await loadLabels2(p.labelsPath);
    assertEquals(labels[0].tags, ["すり抜け"]);
  } finally {
    await Deno.remove(p.base, { recursive: true });
  }
});

Deno.test("runExclude: 論理除外を立て、--undo で外す", async () => {
  const p = await seed();
  try {
    await runExclude(["123"], p);
    assertEquals((await loadLabels2(p.labelsPath))[0].excluded, true);
    await runExclude(["123", "--undo"], p);
    assertEquals((await loadLabels2(p.labelsPath))[0].excluded, false);
  } finally {
    await Deno.remove(p.base, { recursive: true });
  }
});
