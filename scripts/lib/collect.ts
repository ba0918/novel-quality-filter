// 収集オーケストレーション（I/O 専用）。既存サンプリングで冒頭数話を取得し、生HTMLを原本として
// 保存してから、rederive で数値を算出して dataset に追記する。純粋ロジックは src/domain と
// rederive を再利用し、ここではネットワーク・時刻・rawMetrics 算出を注入してテスト可能に保つ。
//
// 数値（rawMetrics・lineMetadata・採点対象）は必ず rederive を通す。収集時に保存した数値と、
// 後で保存HTMLから再計算した値が構造的に一致する（C2）。

import { analyzeBlankLineRatio } from "../../src/domain/analyzer/blank_line.ts";
import { calculateScore } from "../../src/domain/scoring/mod.ts";
import {
  buildEpisodeFromHtml,
  extractFirstEpisodePath,
  extractWorkMetadata,
  type FetchedEpisode,
  parseTargetUrl,
  resolveEpisodeUrl,
  validateEpisodeHtml,
} from "../../src/background/fetchers/kakuyomu.ts";
import { type FetchNextEpisode, sampleEpisodes } from "../../src/background/sampling.ts";
import {
  type Capture,
  type CaptureDecision,
  type CaptureManifest,
  type CapturePage,
  type FetchedEntry,
  makeCaptureId,
  PIPELINE_VERSION,
  saveCapture,
  siteWorkId,
} from "./capture_store.ts";
import { appendRecord, type DatasetRecord } from "./dataset.ts";
import { type ComputeRawMetrics, deriveDecision, rederive } from "./rederive.ts";

const SITE = "kakuyomu";
const KAKUYOMU_BASE = "https://kakuyomu.jp";

// レート制限の下限・上限。カクヨムへの過剰アクセスを防ぐため、呼び出し側が渡した値に
// 関わらず収集境界でここへ矯正する。話ページの取得は1作品あたり最大2話（作品ページ1回を
// 加えて最大3 HTTPリクエスト）、話ページ間の間隔は1000ms未満に短縮しない。
export const MIN_FETCH_INTERVAL_MS = 1000;
export const MAX_EPISODE_FETCH_PER_WORK = 2;

// 呼び出し側の入力に関わらずレート制限を強制する純関数。間隔は下限へ、話数上限は 1..2 へ
// 収め、非有限値（NaN・Infinity）は既定へ倒す。
export function enforceRateLimits(
  intervalMs: number,
  maxEpisodeFetch: number,
): { intervalMs: number; maxEpisodeFetch: number } {
  const interval = Number.isFinite(intervalMs)
    ? Math.max(intervalMs, MIN_FETCH_INTERVAL_MS)
    : MIN_FETCH_INTERVAL_MS;
  const maxEp = Number.isFinite(maxEpisodeFetch)
    ? Math.min(Math.max(Math.trunc(maxEpisodeFetch), 1), MAX_EPISODE_FETCH_PER_WORK)
    : MAX_EPISODE_FETCH_PER_WORK;
  return { intervalMs: interval, maxEpisodeFetch: maxEp };
}

export interface CollectDeps {
  httpGet: (url: string) => Promise<{ status: number; text: string }>;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  computeRawMetrics: ComputeRawMetrics;
  baseDir: string; // 原本(pages/)の置き場
  datasetPath: string;
  intervalMs: number;
  maxEpisodeFetch: number; // 作品あたりに追加取得する話数の上限（レート制限）
}

export interface CollectResult {
  record: DatasetRecord;
  captureId: string;
}

interface FetchedRaw {
  episode: FetchedEpisode;
  html: string;
}

export async function collectWork(
  workId: string,
  tags: string[],
  rawDeps: CollectDeps,
): Promise<CollectResult> {
  // 呼び出し側が渡した間隔・話数上限を収集境界で矯正してから以降のI/Oに使う。
  const deps: CollectDeps = {
    ...rawDeps,
    ...enforceRateLimits(rawDeps.intervalMs, rawDeps.maxEpisodeFetch),
  };
  const workUrl = `${KAKUYOMU_BASE}/works/${workId}`;
  const workHtml = await getHealthyPage(deps, workUrl, false);
  const meta = extractWorkMetadata(workHtml);

  const firstPath = extractFirstEpisodePath(workHtml, workId);
  if (!firstPath) throw new Error(`No episode found for work: ${workId}`);

  const firstUrl = resolveEpisodeUrl(firstPath).href;
  await deps.sleep(deps.intervalMs);
  const firstHtml = await getHealthyPage(deps, firstUrl, true);

  const fetched: FetchedRaw[] = [{
    episode: buildEpisodeFromHtml(firstUrl, firstHtml),
    html: firstHtml,
  }];
  await sampleEpisodes(fetched[0].episode, recordingFetchNext(deps, fetched));

  const captureId = makeCaptureId(deps.now());
  const pages = toPages(fetched);
  // 採点入力(decision)は収集時に selectSamplingTarget を一度だけ走らせて確定し、manifest に凍結する。
  // 保存値は凍結 decision を読む再現(rederive)で算出するため、後でサンプリングロジックが変わっても
  // 保存値と再現値は構造的に一致する（C2）。
  const decision = deriveDecision(pages);
  const manifest = buildManifest(workId, captureId, deps.now(), pages, decision);
  const capture: Capture = { manifest, pages };

  const red = await rederive(capture, deps.computeRawMetrics);
  await saveCapture(deps.baseDir, capture);

  const record: DatasetRecord = {
    workId,
    url: workUrl,
    title: meta.title,
    author: meta.author,
    reviewCount: meta.reviewCount,
    totalReviewPoint: meta.totalReviewPoint,
    totalCharacterCount: meta.totalCharacterCount,
    openingType: red.openingType,
    sampledCount: red.sampledCount,
    episodeUrl: pages[red.targetEpisodeIndex].entry.url,
    score: calculateScore(red.rawMetrics).score,
    rawMetrics: red.rawMetrics,
    blankLineRatio: analyzeBlankLineRatio(red.targetText),
    tags,
    crawledAt: deps.now().toISOString(),
    lineMetadata: red.lineMetadata,
    captureId,
    siteWorkId: siteWorkId(SITE, workId),
    bodyHash: red.bodyHash,
    eligibility: "collected",
  };
  await appendRecord(deps.datasetPath, record);

  return { record, captureId };
}

async function getHealthyPage(
  deps: CollectDeps,
  url: string,
  requireBody: boolean,
): Promise<string> {
  const { status, text } = await deps.httpGet(url);
  if (requireBody) {
    const health = validateEpisodeHtml(status, text);
    if (!health.healthy) throw new Error(`Unhealthy page ${url}: ${health.reason}`);
  } else if (status !== 200) {
    throw new Error(`Failed to fetch ${status}: ${url}`);
  }
  return text;
}

// サンプリングの次話取得をラップし、生HTMLを記録しつつ取得話数上限とレート間隔を守る。
// 上限到達・不良ページ・次話なしは null を返し、sampleEpisodes に終端させる。
function recordingFetchNext(deps: CollectDeps, fetched: FetchedRaw[]): FetchNextEpisode {
  return async (prev) => {
    if (fetched.length >= deps.maxEpisodeFetch) return null;
    if (!prev.nextEpisodeUrl) return null;
    const url = resolveEpisodeUrl(prev.nextEpisodeUrl).href;
    await deps.sleep(deps.intervalMs);
    const { status, text } = await deps.httpGet(url);
    if (!validateEpisodeHtml(status, text).healthy) return null;
    const episode = buildEpisodeFromHtml(url, text);
    fetched.push({ episode, html: text });
    return episode;
  };
}

function toPages(fetched: FetchedRaw[]): CapturePage[] {
  return fetched.map((f, i): CapturePage => {
    const episodeId = parseTargetUrl(f.episode.episodeUrl).episodeId ?? String(i + 1);
    const entry: FetchedEntry = {
      episodeId,
      url: f.episode.episodeUrl,
      order: i,
      file: `${String(i).padStart(3, "0")}_${episodeId}.html`,
    };
    return { entry, html: f.html };
  });
}

function buildManifest(
  workId: string,
  captureId: string,
  now: Date,
  pages: CapturePage[],
  decision: CaptureDecision,
): CaptureManifest {
  return {
    captureId,
    site: SITE,
    workId,
    siteWorkId: siteWorkId(SITE, workId),
    fetched: pages.map((p) => p.entry),
    decision,
    pipelineVersion: PIPELINE_VERSION,
    capturedAt: now.toISOString(),
    health: { healthy: true },
  };
}
