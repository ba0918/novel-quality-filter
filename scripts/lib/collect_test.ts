import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import type { RawMetrics } from "../../src/domain/types.ts";
import { type CollectDeps, collectWork } from "./collect.ts";
import { captureDir, loadCapture } from "./capture_store.ts";
import { loadDataset } from "./dataset.ts";

function zeroMetrics(text: string): RawMetrics {
  return {
    charCount: text.length,
    sentenceCount: 0,
    sentenceLengthSD: 0,
    singleSentParaRatio: 0,
    paragraphLengthSD: 0,
    separatorCount: 0,
    separatorFrequency: 0,
    ttr: 0,
    dialogueCount: 0,
    dialogueEndingVariety: 0,
    descriptionDensitySD: 0,
    taigendomeEntropy: 0,
    emotionDirectnessRatio: 0,
    logicalConnectiveDensity: 0,
    paragraphTransitionEntropy: 0,
    sentenceLengthBurstiness: 0,
  };
}

function workPage(workId: string): string {
  return [
    `<meta property="og:title" content="テスト作品（テスト著者） - カクヨム" />`,
    `<meta property="og:url" content="https://kakuyomu.jp/works/${workId}" />`,
    `"Work:${workId}":{"catchphrase":"","reviewCount":5,"totalReviewPoint":7,"totalCharacterCount":9}`,
    `<a href="/works/${workId}/episodes/1">第1話</a>`,
  ].join("");
}

// sentences 文を持つ本文。next があれば次話リンクを付ける（サンプリング継続を誘発）。
function episode(workId: string, n: number, sentences: number, next?: number): string {
  const ps = Array.from({ length: sentences }, (_, i) => `<p>話${n}の文${i}です。</p>`).join("");
  const nextLink = next
    ? `<a href="/works/${workId}/episodes/${next}" id="contentMain-readNextEpisode">次へ</a>`
    : "";
  return `<h1 class="widget-episodeTitle">第${n}話</h1><div class="widget-episodeBody">${ps}</div>${nextLink}`;
}

function deps(overrides: Partial<CollectDeps> & { pages: Record<string, string> }): CollectDeps {
  const { pages, ...rest } = overrides;
  const sleeps: number[] = [];
  const d: CollectDeps = {
    httpGet: (url: string) => {
      const text = pages[url];
      if (text === undefined) throw new Error(`unexpected fetch (live access?): ${url}`);
      return Promise.resolve({ status: 200, text });
    },
    sleep: (ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    now: () => new Date("2026-08-10T07:47:15.000Z"),
    computeRawMetrics: zeroMetrics,
    baseDir: "",
    datasetPath: "",
    intervalMs: 1000,
    maxEpisodeFetch: 2,
    ...rest,
  };
  // sleeps 配列をテストから参照できるよう関数に貼る。
  (d as unknown as { _sleeps: number[] })._sleeps = sleeps;
  return d;
}

Deno.test("collectWork: 原本を保存し、行メタ・原本参照付きのレコードを dataset に追記する", async () => {
  const base = await Deno.makeTempDir();
  try {
    const datasetPath = join(base, "dataset.jsonl");
    const pages = {
      "https://kakuyomu.jp/works/123": workPage("123"),
      "https://kakuyomu.jp/works/123/episodes/1": episode("123", 1, 40), // 通常開幕
    };
    const d = deps({ pages, baseDir: base, datasetPath });
    const { record, captureId } = await collectWork("123", ["自然分布"], d);

    // dataset に新形式レコードが1件追記される。
    const ds = await loadDataset(datasetPath);
    assertEquals(ds.length, 1);
    assertEquals(ds[0].siteWorkId, "kakuyomu:123");
    assertEquals(ds[0].captureId, captureId);
    assertEquals(ds[0].eligibility, "collected");
    assertEquals(typeof ds[0].bodyHash, "string");
    assertEquals(ds[0].lineMetadata !== undefined, true);
    assertEquals(ds[0].tags, ["自然分布"]);
    assertEquals(record.workId, "123");

    // 原本（生HTML＋manifest）が読み戻せる。
    const cap = await loadCapture(captureDir(base, "kakuyomu", "123", captureId));
    assertEquals(cap.pages.length, 1);
    assertEquals(cap.manifest.decision.sampledCount, 1);
    assertEquals(cap.manifest.decision.openingType, "normal");
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("collectWork: 作品あたりの取得話数の上限を守る（レート制限・実際の話数を manifest に記録）", async () => {
  const base = await Deno.makeTempDir();
  try {
    const datasetPath = join(base, "dataset.jsonl");
    // 各話10文（30文未満）で、上限が無ければ3話まで取得しにいくが、上限2で打ち切る。
    const pages = {
      "https://kakuyomu.jp/works/123": workPage("123"),
      "https://kakuyomu.jp/works/123/episodes/1": episode("123", 1, 10, 2),
      "https://kakuyomu.jp/works/123/episodes/2": episode("123", 2, 10, 3),
      "https://kakuyomu.jp/works/123/episodes/3": episode("123", 3, 10),
    };
    const d = deps({ pages, baseDir: base, datasetPath, maxEpisodeFetch: 2 });
    const { captureId } = await collectWork("123", [], d);

    const cap = await loadCapture(captureDir(base, "kakuyomu", "123", captureId));
    assertEquals(cap.pages.length, 2); // 3話目は取得しない
    assertEquals(cap.manifest.decision.sampledCount, 2);
    // 3話目の URL は一度も fetch していない（過剰アクセスしない）。
    const sleeps = (d as unknown as { _sleeps: number[] })._sleeps;
    assertEquals(sleeps.every((ms) => ms === 1000), true);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("collectWork: 本文抽出できない不良ページは原本にせず dataset にも残さない（C5）", async () => {
  const base = await Deno.makeTempDir();
  try {
    const datasetPath = join(base, "dataset.jsonl");
    const pages = {
      "https://kakuyomu.jp/works/123": workPage("123"),
      "https://kakuyomu.jp/works/123/episodes/1": "<html><body><h1>年齢確認</h1></body></html>",
    };
    const d = deps({ pages, baseDir: base, datasetPath });
    await assertRejects(() => collectWork("123", [], d));

    assertEquals(await loadDataset(datasetPath), []);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});
