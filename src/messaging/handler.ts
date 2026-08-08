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

type MessageHandler<Req extends NqfRequest, Res extends NqfResponse> = (
  message: Req,
) => Promise<Res>;

interface HandlerMap {
  SCORE_WORK?: MessageHandler<ScoreWorkMessage, ScoreResultResponse>;
  RESCORE_WORK?: MessageHandler<RescoreWorkMessage, ScoreResultResponse>;
  GET_CACHED_SCORE?: MessageHandler<GetCachedScoreMessage, ScoreResultResponse>;
  CLEAR_CACHE?: MessageHandler<ClearCacheMessage, ClearCacheResponse>;
}

export function registerHandlers(handlers: HandlerMap): void {
  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: NqfResponse) => void,
    ): boolean => {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return false;
      }

      const msg = message as NqfRequest;
      const handler = handlers[msg.type] as
        | MessageHandler<NqfRequest, NqfResponse>
        | undefined;
      if (!handler) return false;

      handler(msg)
        .then((response) => {
          try {
            sendResponse(response);
          } catch {
            // チャネルが既に閉じている場合（MV3 service worker 終了等）
          }
        })
        .catch((err) => {
          console.error(`[NQF] Handler error for ${msg.type}:`, err);
          const errorResponse = msg.type === "CLEAR_CACHE"
            ? { success: false } as ClearCacheResponse
            : {
              workId: (msg as ScoreWorkMessage).workId,
              result: null,
              fromCache: false,
              error: err instanceof Error ? err.message : String(err),
            } as ScoreResultResponse;
          try {
            sendResponse(errorResponse);
          } catch {
            // チャネルが既に閉じている場合
          }
        });

      return true;
    },
  );
}
