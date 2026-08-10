import { assertEquals, assertNotEquals } from "@std/assert";
import type { RawMetrics } from "../../src/domain/types.ts";
import { buildEpisodeFromHtml } from "../../src/background/fetchers/kakuyomu.ts";
import { aggregateLineMetadata } from "../../src/domain/analyzer/line_metadata.ts";
import type { Capture, CaptureDecision, CaptureManifest, CapturePage } from "./capture_store.ts";
import { rederive, resample } from "./rederive.ts";

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

function captureOf(pages: CapturePage[], decision?: CaptureDecision): Capture {
  const manifest: CaptureManifest = {
    captureId: "cap",
    site: "kakuyomu",
    workId: "123",
    siteWorkId: "kakuyomu:123",
    fetched: pages.map((p) => p.entry),
    decision: decision ?? {
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

Deno.test("rederive(再現): 凍結した manifest.decision に従い、再サンプリングしない（C2・長期再現性）", async () => {
  // 第0話は通常開幕（40文）なので、素の selectSamplingTarget なら第0話を採点対象に選ぶ。
  const ep0 = body(40, "甲");
  const ep1 = body(40, "乙");
  const t1 = buildEpisodeFromHtml("u", ep1).text;

  // 凍結 decision はあえて素のサンプリングと異なる選択（第1話・character-intro）にする。
  // 再現はこの凍結値をそのまま返すべきで、selectSamplingTarget を呼び直してはならない。
  const capture = captureOf([pageOf(0, ep0), pageOf(1, ep1)], {
    sampledCount: 2,
    targetEpisodeIndex: 1,
    openingType: "character-intro",
    concatOrder: [1],
  });

  const r = await rederive(capture, zeroMetrics);

  assertEquals(r.targetText, t1);
  assertEquals(r.targetEpisodeIndex, 1);
  assertEquals(r.concatOrder, [1]);
  assertEquals(r.openingType, "character-intro"); // 再判定せず凍結値を返す
  assertEquals(r.sampledCount, 2);
  assertEquals(r.rawMetrics.charCount, t1.length);
  assertEquals(r.lineMetadata, aggregateLineMetadata(buildEpisodeFromHtml("u", ep1).lines));
});

Deno.test("rederive(再現): concatOrder に従って複数話を連結する", async () => {
  const ep0 = body(20, "甲");
  const ep1 = body(20, "乙");
  const t0 = buildEpisodeFromHtml("u", ep0).text;
  const t1 = buildEpisodeFromHtml("u", ep1).text;
  const capture = captureOf([pageOf(0, ep0), pageOf(1, ep1)], {
    sampledCount: 2,
    targetEpisodeIndex: 0,
    openingType: "too-short",
    concatOrder: [0, 1],
  });

  const r = await rederive(capture, zeroMetrics);

  assertEquals(r.targetText, t0 + t1);
  assertEquals(r.concatOrder, [0, 1]);
  assertEquals(r.rawMetrics.charCount, (t0 + t1).length);
});

Deno.test("resample(再実験): 保存済み全話に selectSamplingTarget を再適用する", async () => {
  const html = body(40); // 通常開幕（30文以上）→ 第1話を単独採点
  const capture = captureOf([pageOf(0, html)]);

  const r = await resample(capture, zeroMetrics);

  const expected = buildEpisodeFromHtml("u", html);
  assertEquals(r.targetText, expected.text);
  assertEquals(r.rawMetrics.charCount, expected.text.length);
  assertEquals(r.lineMetadata, aggregateLineMetadata(expected.lines));
  assertEquals(r.openingType, "normal");
  assertEquals(r.concatOrder, [0]);
});

Deno.test("resample(再実験): +n連結を再現し、順序の正はHTML並び（単話と連結で採点対象が変わる）", async () => {
  // 各話は30文未満（too-short）で、連結して初めて30文に達する。
  const ep0 = body(20, "甲");
  const ep1 = body(20, "乙");
  const t0 = buildEpisodeFromHtml("u", ep0).text;
  const t1 = buildEpisodeFromHtml("u", ep1).text;

  const single = await resample(captureOf([pageOf(0, ep0)]), zeroMetrics);
  const concat = await resample(captureOf([pageOf(0, ep0), pageOf(1, ep1)]), zeroMetrics);

  assertEquals(concat.targetText, t0 + t1);
  assertEquals(concat.concatOrder, [0, 1]);
  assertEquals(single.targetText, t0);
  assertNotEquals(single.targetText, concat.targetText);

  // 順序を入れ替えると採点対象本文も入れ替わる（順序の正は保存HTMLの並び）。
  const reversed = await resample(captureOf([pageOf(0, ep1), pageOf(1, ep0)]), zeroMetrics);
  assertEquals(reversed.targetText, t1 + t0);
  assertNotEquals(reversed.targetText, concat.targetText);
});

Deno.test("bodyHash: 採点対象本文が同じなら一致し、異なれば異なる（転載重複検出の土台）", async () => {
  const a = await resample(captureOf([pageOf(0, body(40))]), zeroMetrics);
  const b = await resample(captureOf([pageOf(0, body(40))]), zeroMetrics);
  const c = await resample(captureOf([pageOf(0, body(41))]), zeroMetrics);
  assertEquals(a.bodyHash, b.bodyHash);
  assertNotEquals(a.bodyHash, c.bodyHash);
});
