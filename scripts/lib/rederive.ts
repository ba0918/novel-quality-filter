// 保存済みの原本（生HTML＋manifest）から、再フェッチなしで rawMetrics＋lineMetadata を計算する。
// 二つの操作をはっきり分ける:
//   - 再現(rederive): 凍結した manifest.decision に従って採点対象を組み立てる。selectSamplingTarget も
//     classifyOpeningFormat も呼ばない。素材は本文・行だけを復元する parseCapturePages で作り、開幕形式は
//     凍結 decision.openingType をそのまま採る。サンプリング/開幕判定のロジックが後で変わっても、同じ原本
//     から常に収集時と同じ値を返す（manifest = 採点入力の唯一の正。C2・長期再現性の要）。
//   - 再実験(resample): 保存済み全話に selectSamplingTarget を再適用し、現在のロジックで採点対象を
//     選び直す。開幕形式判定(classifyOpeningFormat)を呼び直すのはこちらだけ。オフライン実験用
//     （全話を保存している A5 の利点をここで活かす）。再現とは別物。

import type { LineData, LineMetadata, RawMetrics } from "../../src/domain/types.ts";
import { buildEpisodeFromHtml } from "../../src/background/fetchers/kakuyomu.ts";
import {
  classifyOpeningFormat,
  type SampledEpisode,
  selectSamplingTarget,
} from "../../src/domain/analyzer/opening_format.ts";
import { aggregateLineMetadata } from "../../src/domain/analyzer/line_metadata.ts";
import type { Capture, CaptureDecision, CapturePage } from "./capture_store.ts";
import { deriveLineMetrics, type LineMetrics } from "./line_metrics.ts";

// rawMetrics 算出は tokenizer(WASM) を要するため注入する。行メタ側は純粋なので注入しない。
export type ComputeRawMetrics = (text: string) => RawMetrics;

// 再現の素材（保存HTMLから復元した本文・行）。開幕形式ラベル(format)は持たない。
// 開幕形式は再現では凍結 decision を採り、再実験だけが SampledEpisode で持って再判定する。
export interface ParsedEpisode {
  text: string;
  lines: LineData[];
}

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

// 再現: 凍結した manifest.decision に従って採点対象を組み立て、数値を再計算する。
export function rederive(
  capture: Capture,
  computeRawMetrics: ComputeRawMetrics,
): Promise<Rederived> {
  return rederiveWith(capture, capture.manifest.decision, computeRawMetrics);
}

// 再実験: 保存済み全話に selectSamplingTarget を再適用し、現在のロジックで選び直して数値を計算する。
export function resample(
  capture: Capture,
  computeRawMetrics: ComputeRawMetrics,
): Promise<Rederived> {
  return rederiveWith(capture, deriveDecision(capture.pages), computeRawMetrics);
}

// 保存済み全話に selectSamplingTarget を適用し、凍結すべき採点入力(decision)を決める。
// 収集時に一度だけ呼び、結果を manifest.decision に固定する。以後の再現はこの凍結値を使う。
export function deriveDecision(pages: CapturePage[]): CaptureDecision {
  const episodes = pagesToSampled(pages);
  const decision = selectSamplingTarget(episodes);
  return {
    sampledCount: decision.sampledCount,
    targetEpisodeIndex: decision.targetEpisodeIndex,
    openingType: decision.openingType,
    concatOrder: concatOrder(episodes, decision.targetEpisodeIndex, decision.targetText),
  };
}

// 再現・再実験の共通コア。与えられた decision の concatOrder に従って採点対象を組み立てる。
// openingType / sampledCount / targetEpisodeIndex も decision の値をそのまま採用し、再判定しない。
async function rederiveWith(
  capture: Capture,
  decision: CaptureDecision,
  computeRawMetrics: ComputeRawMetrics,
): Promise<Rederived> {
  // 再現の素材は本文・行だけを復元する（開幕形式は再判定せず decision.openingType を採る）。
  const episodes = parseCapturePages(capture.pages);
  const slice = decision.concatOrder.map((i) => episodes[i]);
  const targetText = slice.map((e) => e.text).join("");
  const targetLines = slice.flatMap((e) => e.lines);
  const lineMetadata = aggregateLineMetadata(targetLines);

  return {
    targetText,
    targetLines,
    openingType: decision.openingType,
    sampledCount: decision.sampledCount,
    targetEpisodeIndex: decision.targetEpisodeIndex,
    concatOrder: decision.concatOrder,
    rawMetrics: computeRawMetrics(targetText),
    lineMetadata,
    lineMetrics: deriveLineMetrics(lineMetadata),
    bodyHash: await sha256Hex(targetText),
  };
}

// 再現の素材: 保存HTMLから本文・行だけを復元する。開幕形式の判定(classifyOpeningFormat)は
// 呼ばない。再現は凍結 decision の openingType を採るため、ここで再判定してはならない
// （再判定すると開幕判定ロジックの変更が再現値へ漏れ、C2・長期再現性が崩れる）。
export function parseCapturePages(pages: CapturePage[]): ParsedEpisode[] {
  return pages.map((page) => {
    const ep = buildEpisodeFromHtml(page.entry.url, page.html);
    return { text: ep.text, lines: ep.lines };
  });
}

// 再実験の素材: 復元した本文・行に加えて開幕形式を判定する。selectSamplingTarget が
// format を読んで採点対象を選び直すため、再実験経路だけで classifyOpeningFormat を呼ぶ。
function pagesToSampled(pages: CapturePage[]): SampledEpisode[] {
  return pages.map((page) => {
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
