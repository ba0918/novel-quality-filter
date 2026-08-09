import { assertEquals, assertNotEquals } from "@std/assert";
import type { RawMetrics } from "../../src/domain/types.ts";
import { buildEpisodeFromHtml } from "../../src/background/fetchers/kakuyomu.ts";
import { aggregateLineMetadata } from "../../src/domain/analyzer/line_metadata.ts";
import type { Capture, CaptureManifest, CapturePage } from "./capture_store.ts";
import { rederive } from "./rederive.ts";

function zeroMetrics(text: string): RawMetrics {
  // 実運用の analyzeAll+tokenize を注入せず、採点対象本文だけに依存する決定的な代役。
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

function body(sentences: number, tag = ""): string {
  const ps = Array.from({ length: sentences }, (_, i) => `<p>${tag}テスト文${i}です。</p>`).join(
    "",
  );
  return `<div class="widget-episodeBody">${ps}</div>`;
}

function pageOf(order: number, html: string): CapturePage {
  return {
    entry: {
      episodeId: String(order + 1),
      url: `https://kakuyomu.jp/works/123/episodes/${order + 1}`,
      order,
      file: `${order}.html`,
    },
    html,
  };
}

function captureOf(pages: CapturePage[]): Capture {
  const manifest: CaptureManifest = {
    captureId: "cap",
    site: "kakuyomu",
    workId: "123",
    siteWorkId: "kakuyomu:123",
    fetched: pages.map((p) => p.entry),
    decision: {
      sampledCount: pages.length,
      targetEpisodeIndex: 0,
      openingType: "normal",
      concatOrder: [0],
    },
    pipelineVersion: "line-meta-1",
    capturedAt: "2026-08-10T00:00:00.000Z",
    health: { healthy: true },
  };
  return { manifest, pages };
}

Deno.test("rederive: 保存HTMLからの再計算値が収集時の rawMetrics＋lineMetadata に一致する（C2）", async () => {
  const html = body(40); // 通常開幕（30文以上）→ 第1話を単独採点
  const capture = captureOf([pageOf(0, html)]);

  const r = await rederive(capture, zeroMetrics);

  // 採点対象本文は buildEpisodeFromHtml と同じ抽出であること。
  const expectedText = buildEpisodeFromHtml("u", html).text;
  assertEquals(r.targetText, expectedText);
  // rawMetrics は採点対象本文から算出される。
  assertEquals(r.rawMetrics.charCount, expectedText.length);
  // lineMetadata は採点対象話の行から集計される。
  const expectedLines = buildEpisodeFromHtml("u", html).lines;
  assertEquals(r.lineMetadata, aggregateLineMetadata(expectedLines));
  assertEquals(r.openingType, "normal");
  assertEquals(r.concatOrder, [0]);
});

Deno.test("rederive: +n連結を manifest 順で再現し、単話と連結で採点対象本文が変わる", async () => {
  // 各話は30文未満（too-short）で、連結して初めて30文に達する。
  // ep0/ep1 は内容を変えて、順序が本文に効くこと（順序の正は manifest）を検証できるようにする。
  const ep0 = body(20, "甲");
  const ep1 = body(20, "乙");
  const text0 = buildEpisodeFromHtml("u", ep0).text;
  const text1 = buildEpisodeFromHtml("u", ep1).text;

  const single = await rederive(captureOf([pageOf(0, ep0)]), zeroMetrics);
  const concat = await rederive(captureOf([pageOf(0, ep0), pageOf(1, ep1)]), zeroMetrics);

  // 連結採点では manifest 順で ep0+ep1 が採点対象になる。
  assertEquals(concat.targetText, text0 + text1);
  assertEquals(concat.concatOrder, [0, 1]);
  // 単話採点では ep0 だけが対象で、連結とは本文が変わる。
  assertEquals(single.targetText, text0);
  assertNotEquals(single.targetText, concat.targetText);

  // 順序を入れ替えると採点対象本文も入れ替わる（順序の正は manifest）。
  const reversed = await rederive(captureOf([pageOf(0, ep1), pageOf(1, ep0)]), zeroMetrics);
  assertEquals(reversed.targetText, text1 + text0);
  assertNotEquals(reversed.targetText, concat.targetText);
});

Deno.test("rederive: bodyHash は採点対象本文が同じなら一致し、異なれば異なる（転載重複検出の土台）", async () => {
  const a = await rederive(captureOf([pageOf(0, body(40))]), zeroMetrics);
  const b = await rederive(captureOf([pageOf(0, body(40))]), zeroMetrics);
  const c = await rederive(captureOf([pageOf(0, body(41))]), zeroMetrics);
  assertEquals(a.bodyHash, b.bodyHash);
  assertNotEquals(a.bodyHash, c.bodyHash);
});
