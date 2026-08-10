// C2 の実地検証: collectWork で収集した数値が、保存(saveCapture)→読込(loadCapture)→再現(rederive)
// の往復を越えて完全一致することを、in-memory の近道やゼロ埋めスタブを使わずに確かめる。
// 12指標すべてが本文に依存する非自明な computeRawMetrics を注入し、save/load 境界を越えて
// 全フィールドが本当に比較されるようにする。

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import type { RawMetrics } from "../../src/domain/types.ts";
import { type CollectDeps, collectWork } from "./collect.ts";
import { captureDir, loadCapture } from "./capture_store.ts";
import { loadDataset } from "./dataset.ts";
import { rederive } from "./rederive.ts";

// 全16フィールドを本文から決定的に導く非自明な代役。文字コード和・行数・記号数など、
// 採点対象本文が1文字でも変われば値が動くようにして、save/load 越しの一致検証を意味あるものにする。
function textMetrics(text: string): RawMetrics {
  const codeSum = [...text].reduce((acc, ch) => acc + (ch.codePointAt(0) ?? 0), 0);
  const lineCount = text.split("\n").length;
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  return {
    charCount: text.length,
    sentenceCount: count(/。/g),
    sentenceLengthSD: codeSum % 97,
    singleSentParaRatio: (codeSum % 100) / 100,
    paragraphLengthSD: lineCount,
    separatorCount: count(/、/g),
    separatorFrequency: text.length === 0 ? 0 : codeSum / text.length,
    ttr: (codeSum % 50) / 50,
    dialogueCount: count(/「/g),
    dialogueEndingVariety: (codeSum % 7) / 7,
    descriptionDensitySD: codeSum % 13,
    taigendomeEntropy: (codeSum % 11) / 4,
    emotionDirectnessRatio: (codeSum % 3) / 3,
    logicalConnectiveDensity: (codeSum % 5) / 5,
    paragraphTransitionEntropy: lineCount / 2,
    sentenceLengthBurstiness: (codeSum % 17) / 17,
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

function episode(workId: string, n: number, sentences: number, next?: number): string {
  const ps = Array.from({ length: sentences }, (_, i) => `<p>話${n}の文${i}です。</p>`).join("");
  const nextLink = next
    ? `<a href="/works/${workId}/episodes/${next}" id="contentMain-readNextEpisode">次へ</a>`
    : "";
  return `<h1 class="widget-episodeTitle">第${n}話</h1><div class="widget-episodeBody">${ps}</div>${nextLink}`;
}

function deps(base: string, datasetPath: string, pages: Record<string, string>): CollectDeps {
  return {
    httpGet: (url: string) => {
      const text = pages[url];
      if (text === undefined) throw new Error(`unexpected fetch (live access?): ${url}`);
      return Promise.resolve({ status: 200, text });
    },
    sleep: () => Promise.resolve(),
    now: () => new Date("2026-08-10T07:47:15.000Z"),
    computeRawMetrics: textMetrics,
    baseDir: base,
    datasetPath,
    intervalMs: 1000,
    maxEpisodeFetch: 2,
  };
}

Deno.test("C2: collect の保存値が save→load→rederive の往復後も完全一致する（+n連結・非自明な指標）", async () => {
  const base = await Deno.makeTempDir();
  try {
    const datasetPath = join(base, "dataset.jsonl");
    // 第1話は30文未満（too-short）で、第2話と連結して初めて30文に達する構成。
    // これにより concatOrder は [0,1] という非自明な値になる。
    const pages = {
      "https://kakuyomu.jp/works/123": workPage("123"),
      "https://kakuyomu.jp/works/123/episodes/1": episode("123", 1, 20, 2),
      "https://kakuyomu.jp/works/123/episodes/2": episode("123", 2, 20),
    };
    const d = deps(base, datasetPath, pages);

    const { record } = await collectWork("123", ["自然分布"], d);

    // 収集時に dataset へ書かれたレコードを、実物の loadDataset で読み戻す。
    const stored = (await loadDataset(datasetPath))[0];
    // 実物の loadCapture で原本を読み戻し、実物の rederive で再現する。
    const reloaded = await loadCapture(captureDir(base, "kakuyomu", "123", record.captureId!));
    const red = await rederive(reloaded, textMetrics);

    // 連結が効いていること（concatOrder が非自明）を前提として固定する。
    assertEquals(reloaded.manifest.decision.concatOrder, [0, 1]);
    assertEquals(reloaded.manifest.decision.sampledCount, 2);
    assertEquals(reloaded.manifest.decision.targetEpisodeIndex, 0);
    assertEquals(reloaded.manifest.decision.openingType, "too-short");

    // save→load→rederive を越えて、12指標(rawMetrics)が全フィールド一致する。
    assertEquals(red.rawMetrics, stored.rawMetrics);
    // 行メタも一致する。
    assertEquals(red.lineMetadata, stored.lineMetadata);
    // 本文ハッシュも一致する。
    assertEquals(red.bodyHash, stored.bodyHash);
    // manifest の凍結 decision と再現された採点入力が一致する。
    assertEquals(red.targetEpisodeIndex, reloaded.manifest.decision.targetEpisodeIndex);
    assertEquals(red.concatOrder, reloaded.manifest.decision.concatOrder);
    assertEquals(red.sampledCount, reloaded.manifest.decision.sampledCount);
    assertEquals(red.openingType, reloaded.manifest.decision.openingType);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});
