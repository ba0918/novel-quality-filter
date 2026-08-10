import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { appendRecord, type DatasetRecord } from "./dataset.ts";
import { loadLabels2, setLabel } from "./labels_store.ts";
import { editLabelStore } from "./labels_cli.ts";

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

Deno.test("editLabelStore: 収集済み作品には URL からラベルを付けられる", async () => {
  const base = await Deno.makeTempDir();
  try {
    const paths = {
      datasetPath: join(base, "dataset.jsonl"),
      labelsPath: join(base, "labels.jsonl"),
    };
    await appendRecord(paths.datasetPath, datasetRecord("123"));

    const id = await editLabelStore(
      "https://kakuyomu.jp/works/123",
      (records, siteWorkId, now) => setLabel(records, siteWorkId, "駄", now),
      paths,
    );
    assertEquals(id, "kakuyomu:123");

    const labels = await loadLabels2(paths.labelsPath);
    assertEquals(labels.length, 1);
    assertEquals(labels[0].quality, "駄");
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("editLabelStore: 未収集の作品は拒否し labels を書かない（存在検証）", async () => {
  const base = await Deno.makeTempDir();
  try {
    const paths = {
      datasetPath: join(base, "dataset.jsonl"),
      labelsPath: join(base, "labels.jsonl"),
    };
    await appendRecord(paths.datasetPath, datasetRecord("123"));

    await assertRejects(
      () => editLabelStore("999", (r, id, now) => setLabel(r, id, "良", now), paths),
      Error,
      "未収集",
    );
    assertEquals(await loadLabels2(paths.labelsPath), []);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});
