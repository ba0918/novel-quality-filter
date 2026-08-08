import type {
  ClearCacheMessage,
  ClearCacheResponse,
  RescoreWorkMessage,
  ScoreResultResponse,
  ScoreWorkMessage,
} from "../messaging/types.ts";
import { registerHandlers } from "../messaging/handler.ts";
import { clearAll, deleteScore, getScore, putScore } from "../shared/storage.ts";
import type { CachedScore } from "../shared/storage.ts";
import { CURRENT_SCHEMA_VERSION, isCacheStale } from "../shared/cache-staleness.ts";
import { enqueue } from "./fetch-queue.ts";
import { fetchFirstEpisodeText } from "./fetchers/kakuyomu.ts";
import { analyzeAll } from "../domain/analyzer/mod.ts";
import { calculateScore } from "../domain/scoring/mod.ts";
import { tokenize } from "../domain/tokenizer/mod.ts";
import { tokenizerReady } from "./init.ts";

const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

export function setupScoreHandlers(): void {
  registerHandlers({
    SCORE_WORK: handleScoreWork,
    RESCORE_WORK: handleRescoreWork,
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
        },
        fromCache: true,
      };
    }
  }

  return scoreWork(workId);
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

    const response = await enqueue(() => fetchFirstEpisodeText(workId));
    const tokens = tokenize(response.text);
    const rawMetrics = analyzeAll(response.text, tokens, tokenize);
    const result = calculateScore(rawMetrics);

    await putScore({
      workId,
      score: result.score,
      metrics: result.metrics,
      penalties: result.penalties,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      scoredAt: Date.now(),
      episodeUrl: response.episodeUrl,
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

function isNegativeCache(cached: CachedScore): boolean {
  return cached.score === -1;
}
