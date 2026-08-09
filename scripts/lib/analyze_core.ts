// カクヨム作品を URL から採点するパイプライン核。analyze_url.ts（CLI）と
// crawl_tags.ts（較正クロール）で共有する。採点対象話は本番と同じ sampleEpisodes で決める。
//
// 生指標 (RawMetrics) をそのまま返すのが要点。これを保存しておけば、後段の実験ハーネスが
// 重み・正規化・ペナルティを変えたスコアを再フェッチなしで正確に再計算できる。

import { FETCH_INTERVAL_MS, FETCH_TIMEOUT_MS } from "../../src/shared/constants.ts";
import { sleep } from "../../src/shared/async.ts";
import {
  extractEpisodeTitle,
  extractFirstEpisodePath,
  extractNextEpisodeUrl,
  extractTextFromHtml,
  extractWorkMetadata,
  type FetchedEpisode,
  parseTargetUrl,
  resolveEpisodeUrl,
  type WorkMetadata,
} from "../../src/background/fetchers/kakuyomu.ts";
import { sampleEpisodes } from "../../src/background/sampling.ts";
import { tokenize } from "../../src/domain/tokenizer/mod.ts";
import { analyzeAll } from "../../src/domain/analyzer/mod.ts";
import { analyzeBlankLineRatio } from "../../src/domain/analyzer/blank_line.ts";
import { calculateScore } from "../../src/domain/scoring/mod.ts";
import type { RawMetrics } from "../../src/domain/types.ts";

export interface AnalyzeResult {
  meta: WorkMetadata;
  firstEpisodeTitle: string;
  openingType: string;
  sampledCount: number;
  episodeUrl: string;
  score: number;
  rawMetrics: RawMetrics; // 生指標12個（実験ハーネスの再計算用）
  blankLineRatio: number; // 観測専用（スコア非算入）
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "Mozilla/5.0 (compatible; novel-quality-filter/analyze)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${res.status}: ${url}`);
  return res.text();
}

async function fetchEpisode(episodeUrl: string): Promise<FetchedEpisode> {
  const html = await fetchText(episodeUrl);
  return {
    episodeUrl,
    text: extractTextFromHtml(html),
    episodeTitle: extractEpisodeTitle(html) ?? "",
    nextEpisodeUrl: extractNextEpisodeUrl(html),
  };
}

interface Target {
  text: string;
  episodeUrl: string;
  firstEpisodeTitle: string;
  openingType: string;
  sampledCount: number;
}

// 採点対象話を決める。episodeMode 時は渡された話をそのまま（開幕サンプリングを
// 迂回して）採点し、1話と後半話の文体ドリフトを比較できるようにする。
async function resolveTarget(
  url: string,
  workHtml: string,
  workId: string,
  episodeMode: boolean,
): Promise<Target> {
  const { episodeId } = parseTargetUrl(url);
  if (episodeMode && episodeId) {
    await sleep(FETCH_INTERVAL_MS);
    const ep = await fetchEpisode(
      resolveEpisodeUrl(`/works/${workId}/episodes/${episodeId}`).href,
    );
    return {
      text: ep.text,
      episodeUrl: ep.episodeUrl,
      firstEpisodeTitle: ep.episodeTitle,
      openingType: "直接採点",
      sampledCount: 1,
    };
  }

  const firstPath = extractFirstEpisodePath(workHtml, workId);
  if (!firstPath) throw new Error(`No episode found for work: ${workId}`);
  await sleep(FETCH_INTERVAL_MS);
  const first = await fetchEpisode(resolveEpisodeUrl(firstPath).href);
  const sampling = await sampleEpisodes(first, async (prev) => {
    if (!prev.nextEpisodeUrl) return null;
    await sleep(FETCH_INTERVAL_MS);
    return fetchEpisode(resolveEpisodeUrl(prev.nextEpisodeUrl).href);
  });
  return {
    text: sampling.targetText,
    episodeUrl: sampling.episodeUrl,
    firstEpisodeTitle: first.episodeTitle,
    openingType: sampling.openingType,
    sampledCount: sampling.sampledCount,
  };
}

// tokenizer は呼び出し側で initTokenizer() 済みであること。
export async function analyzeWork(url: string, episodeMode: boolean): Promise<AnalyzeResult> {
  const { workId } = parseTargetUrl(url);
  const workHtml = await fetchText(`https://kakuyomu.jp/works/${workId}`);
  const meta = extractWorkMetadata(workHtml);

  const target = await resolveTarget(url, workHtml, workId, episodeMode);

  const tokens = tokenize(target.text);
  const rawMetrics = analyzeAll(target.text, tokens, tokenize);
  const { score } = calculateScore(rawMetrics);

  return {
    meta,
    firstEpisodeTitle: target.firstEpisodeTitle,
    openingType: target.openingType,
    sampledCount: target.sampledCount,
    episodeUrl: target.episodeUrl,
    score,
    rawMetrics,
    blankLineRatio: analyzeBlankLineRatio(target.text),
  };
}
