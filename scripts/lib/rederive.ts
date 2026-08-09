// 保存済みの原本（生HTML＋manifest）から、再フェッチなしで rawMetrics＋lineMetadata を再計算する
// 単一の導出コア。収集(fetch_and_store)も分析も必ずここを通すことで、保存された数値と再計算値が
// 構造的に一致する（C2）。乱数・時刻に依存する選択は無いので、同じ原本から常に同じ結果を返す。

import type { LineData, LineMetadata, RawMetrics } from "../../src/domain/types.ts";
import { buildEpisodeFromHtml } from "../../src/background/fetchers/kakuyomu.ts";
import {
  classifyOpeningFormat,
  type SampledEpisode,
  selectSamplingTarget,
} from "../../src/domain/analyzer/opening_format.ts";
import { aggregateLineMetadata } from "../../src/domain/analyzer/line_metadata.ts";
import type { Capture } from "./capture_store.ts";
import { deriveLineMetrics, type LineMetrics } from "./line_metrics.ts";

// rawMetrics 算出は tokenizer(WASM) を要するため注入する。行メタ側は純粋なので注入しない。
export type ComputeRawMetrics = (text: string) => RawMetrics;

export interface Rederived {
  targetText: string;
  targetLines: LineData[];
  openingType: string;
  sampledCount: number;
  targetEpisodeIndex: number;
  concatOrder: number[];
  rawMetrics: RawMetrics;
  lineMetadata: LineMetadata;
  lineMetrics: LineMetrics;
  bodyHash: string;
}

export async function rederive(
  capture: Capture,
  computeRawMetrics: ComputeRawMetrics,
): Promise<Rederived> {
  const episodes = toSampledEpisodes(capture);
  const decision = selectSamplingTarget(episodes);
  const lineMetadata = aggregateLineMetadata(decision.targetLines);

  return {
    targetText: decision.targetText,
    targetLines: decision.targetLines,
    openingType: decision.openingType,
    sampledCount: decision.sampledCount,
    targetEpisodeIndex: decision.targetEpisodeIndex,
    concatOrder: concatOrder(episodes, decision.targetEpisodeIndex, decision.targetText),
    rawMetrics: computeRawMetrics(decision.targetText),
    lineMetadata,
    lineMetrics: deriveLineMetrics(lineMetadata),
    bodyHash: await sha256Hex(decision.targetText),
  };
}

function toSampledEpisodes(capture: Capture): SampledEpisode[] {
  return capture.pages.map((page) => {
    const ep = buildEpisodeFromHtml(page.entry.url, page.html);
    return {
      text: ep.text,
      lines: ep.lines,
      format: classifyOpeningFormat(ep.text, ep.episodeTitle),
    };
  });
}

// 採点対象へ連結された話の order 列を、対象本文と一致する連続範囲から復元する。
// selectSamplingTarget は targetEpisodeIndex から始まる連続範囲を連結するため、その範囲を辿る。
function concatOrder(episodes: SampledEpisode[], start: number, targetText: string): number[] {
  let acc = "";
  const orders: number[] = [];
  for (let i = start; i < episodes.length; i++) {
    acc += episodes[i].text;
    orders.push(i);
    if (acc === targetText) return orders;
  }
  return [start];
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
