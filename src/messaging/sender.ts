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

const MESSAGE_TIMEOUT_MS = 30_000;

function sendToBackground(message: NqfRequest): Promise<NqfResponse> {
  return Promise.race([
    chrome.runtime.sendMessage(message),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Message timeout")), MESSAGE_TIMEOUT_MS)
    ),
  ]);
}
