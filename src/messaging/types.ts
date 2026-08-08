import type { ScoreResult } from "../domain/types.ts";

export interface ScoreWorkMessage {
  type: "SCORE_WORK";
  workId: string;
  workUrl: string;
}

export interface RescoreWorkMessage {
  type: "RESCORE_WORK";
  workId: string;
  workUrl: string;
}

export interface GetCachedScoreMessage {
  type: "GET_CACHED_SCORE";
  workId: string;
}

export interface ClearCacheMessage {
  type: "CLEAR_CACHE";
}

export type NqfRequest =
  | ScoreWorkMessage
  | RescoreWorkMessage
  | GetCachedScoreMessage
  | ClearCacheMessage;

export interface ScoreResultResponse {
  workId: string;
  result: ScoreResult | null;
  fromCache: boolean;
  error?: string;
}

export interface ClearCacheResponse {
  success: boolean;
}

export type NqfResponse = ScoreResultResponse | ClearCacheResponse;
