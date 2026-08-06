import { sendRescoreRequest, sendScoreRequest } from "../messaging/sender.ts";
import {
  detectWorkCards,
  markAsProcessed,
  observeNewCards,
  type WorkCard,
} from "./kakuyomu/card-detector.ts";
import { injectBadge, injectLoadingBadge, showError } from "./kakuyomu/badge-injector.ts";
import { injectStyles } from "./kakuyomu/styles.ts";

console.log("[NQF] Content script loaded on:", globalThis.location.href);

function main(): void {
  injectStyles();

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

function processCards(cards: WorkCard[]): void {
  for (const card of cards) {
    markAsProcessed(card.cardElement);
    injectLoadingBadge(card.cardElement);
    scoreCard(card);
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
