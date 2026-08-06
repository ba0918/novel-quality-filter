import type {
  ClearCacheMessage,
  ClearCacheResponse,
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
        .then(sendResponse)
        .catch((err) => {
          console.error(`[NQF] Handler error for ${msg.type}:`, err);
          if (msg.type === "CLEAR_CACHE") {
            sendResponse({ success: false } as ClearCacheResponse);
          } else {
            const workId = (msg as ScoreWorkMessage).workId;
            sendResponse({
              workId,
              result: null,
              fromCache: false,
              error: err instanceof Error ? err.message : String(err),
            } as ScoreResultResponse);
          }
        });

      return true;
    },
  );
}
