import type {
  ClearCacheMessage,
  ClearCacheResponse,
  GetCachedScoreMessage,
  RescoreWorkMessage,
  ScoreResultResponse,
  ScoreWorkMessage,
} from "../messaging/types.ts";
import { registerHandlers } from "../messaging/handler.ts";
import { clearAll, deleteScore, getScore, putScore } from "../shared/storage.ts";
import type { CachedScore } from "../shared/storage.ts";
import { CURRENT_SCHEMA_VERSION, isCacheStale } from "../shared/cache-staleness.ts";
import { MAX_SAMPLED_EPISODES } from "../shared/constants.ts";
import { enqueue } from "./fetch-queue.ts";
import { fetchFirstEpisodeText, fetchNextEpisodeText } from "./fetchers/kakuyomu.ts";
import type { FetchedEpisode } from "./fetchers/kakuyomu.ts";
import { analyzeAll } from "../domain/analyzer/mod.ts";
import { classifyOpeningFormat, selectSamplingTarget } from "../domain/analyzer/opening_format.ts";
import type { SampledEpisode } from "../domain/analyzer/opening_format.ts";
import { calculateScore } from "../domain/scoring/mod.ts";
import { tokenize } from "../domain/tokenizer/mod.ts";
import { tokenizerReady } from "./init.ts";
import type { OpeningFormat, ScoreResult } from "../domain/types.ts";

const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

export function setupScoreHandlers(): void {
  registerHandlers({
    SCORE_WORK: handleScoreWork,
    RESCORE_WORK: handleRescoreWork,
    GET_CACHED_SCORE: handleGetCachedScore,
    CLEAR_CACHE: handleClearCache,
  });
}

async function handleScoreWork(message: ScoreWorkMessage): Promise<ScoreResultResponse> {
  const { workId } = message;

  const cached = await getScore(workId);
  if (cached) {
    if (isNegativeCache(cached)) {
      if (Date.now() - cached.scoredAt < NEGATIVE_CACHE_TTL_MS) {
        return { workId, result: null, fromCache: true, error: "Previously failed" };
      }
      await deleteScore(workId);
    } else if (isCacheStale(cached.schemaVersion)) {
      await deleteScore(workId);
    } else {
      return {
        workId,
        result: {
          score: cached.score,
          metrics: cached.metrics,
          penalties: cached.penalties ?? [],
          openingType: cached.openingType,
          sampledCount: cached.sampledCount,
        },
        fromCache: true,
      };
    }
  }

  return scoreWork(workId);
}

async function handleGetCachedScore(
  message: GetCachedScoreMessage,
): Promise<ScoreResultResponse> {
  const { workId } = message;
  const cached = await getScore(workId);

  if (!cached || isNegativeCache(cached) || isCacheStale(cached.schemaVersion)) {
    return { workId, result: null, fromCache: true };
  }

  return {
    workId,
    result: {
      score: cached.score,
      metrics: cached.metrics,
      penalties: cached.penalties ?? [],
      openingType: cached.openingType,
      sampledCount: cached.sampledCount,
    },
    fromCache: true,
  };
}

async function handleRescoreWork(message: RescoreWorkMessage): Promise<ScoreResultResponse> {
  const { workId } = message;
  await deleteScore(workId);
  return scoreWork(workId);
}

async function handleClearCache(_message: ClearCacheMessage): Promise<ClearCacheResponse> {
  try {
    await clearAll();
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function scoreWork(workId: string): Promise<ScoreResultResponse> {
  try {
    await tokenizerReady;

    const first = await enqueue(() => fetchFirstEpisodeText(workId));
    const sampling = await sampleEpisodes(first);

    const tokens = tokenize(sampling.targetText);
    const rawMetrics = analyzeAll(sampling.targetText, tokens, tokenize);
    const calculated = calculateScore(rawMetrics);
    const result: ScoreResult = {
      score: calculated.score,
      metrics: calculated.metrics,
      penalties: calculated.penalties,
      openingType: sampling.openingType,
      sampledCount: sampling.sampledCount,
    };

    await putScore({
      workId,
      score: result.score,
      metrics: result.metrics,
      penalties: result.penalties,
      openingType: sampling.openingType,
      sampledCount: sampling.sampledCount,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      scoredAt: Date.now(),
      episodeUrl: sampling.episodeUrl,
    });

    return { workId, result, fromCache: false };
  } catch (err) {
    console.error(`[NQF] Scoring failed for ${workId}:`, err);

    await putScore({
      workId,
      score: -1,
      metrics: [],
      penalties: [],
      schemaVersion: CURRENT_SCHEMA_VERSION,
      scoredAt: Date.now(),
      episodeUrl: "",
    }).catch(() => {});

    return {
      workId,
      result: null,
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

interface Sampling {
  targetText: string;
  openingType: OpeningFormat;
  sampledCount: number;
  episodeUrl: string;
}

async function sampleEpisodes(first: FetchedEpisode): Promise<Sampling> {
  const episodes: FetchedEpisode[] = [first];

  for (let i = 0; i < MAX_SAMPLED_EPISODES; i++) {
    const decision = selectSamplingTarget(toSampled(episodes));
    if (decision.done) break;

    const next = await fetchNextEpisodeOrNull(episodes[episodes.length - 1]);
    if (next === null) break;
    episodes.push(next);
  }

  const decision = selectSamplingTarget(toSampled(episodes));
  return {
    targetText: decision.targetText,
    openingType: decision.openingType,
    sampledCount: decision.sampledCount,
    episodeUrl: episodes[decision.targetEpisodeIndex].episodeUrl,
  };
}

function toSampled(episodes: FetchedEpisode[]): SampledEpisode[] {
  return episodes.map((ep) => ({
    text: ep.text,
    format: classifyOpeningFormat(ep.text, ep.episodeTitle),
  }));
}

async function fetchNextEpisodeOrNull(prev: FetchedEpisode): Promise<FetchedEpisode | null> {
  try {
    return await enqueue(() => fetchNextEpisodeText(prev));
  } catch (err) {
    // 取得失敗（削除済み・非公開・アクセス制限）は終端として扱う
    console.warn(`[NQF] Next episode fetch failed:`, err);
    return null;
  }
}

function isNegativeCache(cached: CachedScore): boolean {
  return cached.score === -1;
}
