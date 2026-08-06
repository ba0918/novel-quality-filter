import type {
  ClearCacheMessage,
  ClearCacheResponse,
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

export function sendClearCacheRequest(): Promise<ClearCacheResponse> {
  const message: ClearCacheMessage = { type: "CLEAR_CACHE" };
  return sendToBackground(message) as Promise<ClearCacheResponse>;
}

function sendToBackground(message: NqfRequest): Promise<NqfResponse> {
  return chrome.runtime.sendMessage(message);
}
