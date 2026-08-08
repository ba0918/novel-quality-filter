import {
  sendGetCachedScoreRequest,
  sendRescoreRequest,
  sendScoreRequest,
} from "../messaging/sender.ts";
import {
  detectWorkCards,
  markAsProcessed,
  observeNewCards,
  type WorkCard,
} from "./kakuyomu/card-detector.ts";
import {
  injectBadge,
  injectLoadingBadge,
  injectQueuedBadge,
  showError,
} from "./kakuyomu/badge-injector.ts";
import { detectWorkPage } from "./kakuyomu/work-page-detector.ts";
import {
  injectScoreButton,
  injectWorkBadge,
  injectWorkError,
  injectWorkLoading,
} from "./kakuyomu/work-page-injector.ts";
import { injectStyles } from "./kakuyomu/styles.ts";

console.log("[NQF] Content script loaded on:", globalThis.location.href);

function main(): void {
  injectStyles();

  const pathname = globalThis.location.pathname;
  const workId = detectWorkPage(pathname);
  if (workId) {
    handleWorkPage(workId);
    return;
  }

  // エピソード・レビューページなど作品配下のサブページでは何もしない
  if (pathname.startsWith("/works/")) {
    return;
  }

  // ランキング / 検索ページのフロー
  const initialCards = detectWorkCards();
  if (initialCards.length > 0) {
    console.log(`[NQF] Found ${initialCards.length} work cards`);
    processCards(initialCards);
  }

  observeNewCards((newCards) => {
    console.log(`[NQF] New cards detected: ${newCards.length}`);
    processCards(newCards);
  });
}

const CONCURRENT_SCORES = 2;

async function processCards(cards: WorkCard[]): Promise<void> {
  for (const card of cards) {
    markAsProcessed(card.cardElement);
    injectQueuedBadge(card.cardElement);
  }

  for (let i = 0; i < cards.length; i += CONCURRENT_SCORES) {
    const batch = cards.slice(i, i + CONCURRENT_SCORES);
    for (const card of batch) {
      injectLoadingBadge(card.cardElement);
    }
    await Promise.all(batch.map((card) => scoreCard(card)));
  }
}

async function scoreCard(card: WorkCard): Promise<void> {
  try {
    const response = await sendScoreRequest(card.workId, card.workUrl);
    if (response.result) {
      injectBadge(card.cardElement, card.workId, response.result, handleRescore);
    } else {
      console.warn(`[NQF] Scoring failed for ${card.workId}:`, response.error);
      showError(card.cardElement);
    }
  } catch (err) {
    console.error(`[NQF] Message failed for ${card.workId}:`, err);
    showError(card.cardElement);
  }
}

async function handleRescore(workId: string, cardElement: HTMLElement): Promise<void> {
  injectLoadingBadge(cardElement);

  try {
    const workUrl = `https://kakuyomu.jp/works/${workId}`;
    const response = await sendRescoreRequest(workId, workUrl);
    if (response.result) {
      injectBadge(cardElement, workId, response.result, handleRescore);
    } else {
      showError(cardElement);
    }
  } catch {
    showError(cardElement);
  }
}

function handleWorkPage(workId: string): void {
  console.log(`[NQF] Work page detected: ${workId}`);

  const container = findWorkPageContainer();
  if (container) {
    initWorkPageUI(workId, container);
    return;
  }

  // SPA遷移や遅延レンダリングでサブヘッダーが未出現の場合、出現を待つ
  waitForWorkPageContainer((found) => {
    initWorkPageUI(workId, found);
  });
}

function waitForWorkPageContainer(
  callback: (container: HTMLElement) => void,
): void {
  const observer = new MutationObserver(() => {
    const container = findWorkPageContainer();
    if (container) {
      observer.disconnect();
      callback(container);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10_000);
}

async function initWorkPageUI(workId: string, container: HTMLElement): Promise<void> {
  // キャッシュ確認（スコアリングは発動しない）
  try {
    const cached = await sendGetCachedScoreRequest(workId);
    if (cached.result) {
      injectWorkBadge(container, cached.result, () => rescoreWorkPage(workId, container));
      return;
    }
  } catch {
    // キャッシュ確認失敗はスコアリングボタン表示にフォールバック
  }

  // 未スコア: スコアリングボタンを表示
  injectScoreButton(container, () => scoreWorkPage(workId, container));
}

async function scoreWorkPage(workId: string, container: HTMLElement): Promise<void> {
  injectWorkLoading(container);

  try {
    const workUrl = `https://kakuyomu.jp/works/${workId}`;
    const response = await sendScoreRequest(workId, workUrl);
    if (response.result) {
      injectWorkBadge(container, response.result, () => rescoreWorkPage(workId, container));
    } else {
      console.warn(`[NQF] Scoring failed for work page ${workId}:`, response.error);
      injectWorkError(container, () => scoreWorkPage(workId, container));
    }
  } catch (err) {
    console.error(`[NQF] Score request failed for work page ${workId}:`, err);
    injectWorkError(container, () => scoreWorkPage(workId, container));
  }
}

async function rescoreWorkPage(workId: string, container: HTMLElement): Promise<void> {
  injectWorkLoading(container);

  try {
    const workUrl = `https://kakuyomu.jp/works/${workId}`;
    const response = await sendRescoreRequest(workId, workUrl);
    if (response.result) {
      injectWorkBadge(container, response.result, () => rescoreWorkPage(workId, container));
    } else {
      console.warn(`[NQF] Rescore failed for work page ${workId}`);
      injectWorkError(container, () => rescoreWorkPage(workId, container));
    }
  } catch (err) {
    console.error(`[NQF] Rescore request failed for work page ${workId}:`, err);
    injectWorkError(container, () => rescoreWorkPage(workId, container));
  }
}

function findWorkPageContainer(): HTMLElement | null {
  // ★数リンク（/reviews への href + ★ テキスト）を探す
  const reviewLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a[href$="/reviews"]',
  );
  for (const link of reviewLinks) {
    if (!link.textContent?.includes("★")) continue;
    // ★数リンクの親 Layout 行を返す
    const layoutRow = link.closest<HTMLElement>(
      '[class*="Layout_layout"]',
    );
    if (layoutRow) return layoutRow;
    if (link.parentElement) return link.parentElement;
  }

  // フォールバック: フォロワーリンク（/followers への href）の親行
  const followerLink = document.querySelector<HTMLAnchorElement>(
    'a[href*="/followers"]',
  );
  if (followerLink) {
    const row = followerLink.closest<HTMLElement>(
      '[class*="Layout_layout"]',
    );
    if (row) return row;
  }

  return null;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
