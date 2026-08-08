import type {
  ClearCacheMessage,
  ClearCacheResponse,
  GetCachedScoreMessage,
  NqfRequest,
  NqfResponse,
  RescoreWorkMessage,
  ScoreResultResponse,
  ScoreWorkMessage,
} from "./types.ts";

export function sendScoreRequest(
  workId: string,
  workUrl: string,
): Promise<ScoreResultResponse> {
  const message: ScoreWorkMessage = { type: "SCORE_WORK", workId, workUrl };
  return sendToBackground(message) as Promise<ScoreResultResponse>;
}

export function sendRescoreRequest(
  workId: string,
  workUrl: string,
): Promise<ScoreResultResponse> {
  const message: RescoreWorkMessage = { type: "RESCORE_WORK", workId, workUrl };
  return sendToBackground(message) as Promise<ScoreResultResponse>;
}

export function sendGetCachedScoreRequest(
  workId: string,
): Promise<ScoreResultResponse> {
  const message: GetCachedScoreMessage = { type: "GET_CACHED_SCORE", workId };
  return sendToBackground(message) as Promise<ScoreResultResponse>;
}

export function sendClearCacheRequest(): Promise<ClearCacheResponse> {
  const message: ClearCacheMessage = { type: "CLEAR_CACHE" };
  return sendToBackground(message) as Promise<ClearCacheResponse>;
}

const MESSAGE_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 500;

function isChannelClosedError(err: unknown): boolean {
  return err instanceof Error &&
    err.message.includes("message channel closed");
}

async function sendToBackground(message: NqfRequest): Promise<NqfResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await Promise.race([
        chrome.runtime.sendMessage(message),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Message timeout")),
            MESSAGE_TIMEOUT_MS,
          )
        ),
      ]);
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && isChannelClosedError(err)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
