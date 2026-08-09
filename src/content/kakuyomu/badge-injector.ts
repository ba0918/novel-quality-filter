import type { ScoreResult } from "../../domain/types.ts";
import { DEFAULT_THRESHOLD } from "../../domain/scoring/mod.ts";
import { createTooltip, scoreToColor } from "./score-color.ts";
import { findStarCountElement } from "./meta-element.ts";

export function injectBadge(
  cardElement: HTMLElement,
  workId: string,
  result: ScoreResult,
  onRescore: (workId: string, cardElement: HTMLElement) => void,
): void {
  removeBadge(cardElement);

  const badge = createBadge(result.score);
  const tooltip = createTooltip(result);
  badge.appendChild(tooltip);

  badge.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBadgeLoading(badge);
    onRescore(workId, cardElement);
  });

  insertBadgeElement(cardElement, badge);

  if (result.score <= DEFAULT_THRESHOLD) {
    cardElement.classList.add("nqf-suspect");
  } else {
    cardElement.classList.remove("nqf-suspect");
  }
}

export function injectQueuedBadge(cardElement: HTMLElement): void {
  removeBadge(cardElement);

  const badge = document.createElement("span");
  badge.className = "nqf-badge nqf-badge--queued";
  badge.textContent = "—";

  insertBadgeElement(cardElement, badge);
}

export function injectLoadingBadge(cardElement: HTMLElement): void {
  removeBadge(cardElement);

  const badge = document.createElement("span");
  badge.className = "nqf-badge nqf-badge--loading";
  badge.textContent = "...";

  insertBadgeElement(cardElement, badge);
}

function insertBadgeElement(cardElement: HTMLElement, badge: HTMLElement): void {
  // ★数リンクの横に挿入（メタデータ行）
  const starLink = findStarCountLink(cardElement);
  if (starLink) {
    starLink.parentElement?.insertBefore(badge, starLink.nextSibling);
    return;
  }

  // フォールバック: カードの末尾
  cardElement.appendChild(badge);
}

function findStarCountLink(cardElement: HTMLElement): HTMLAnchorElement | null {
  // WorkMeta 領域内の★数リンクを探す（レビュー欄の方を拾わないように限定）
  const metaArea = cardElement.querySelector('[class*="WorkMeta"]');
  return findStarCountElement(metaArea ?? cardElement);
}

export function showError(cardElement: HTMLElement): void {
  const existing = cardElement.querySelector<HTMLElement>(".nqf-badge");
  if (existing) {
    existing.textContent = "!";
    existing.className = "nqf-badge";
    existing.style.backgroundColor = "#666";
    existing.title = "スコアリング失敗";
  }
}

function removeBadge(cardElement: HTMLElement): void {
  const existing = cardElement.querySelector(".nqf-badge");
  if (existing) existing.remove();
}

function setBadgeLoading(badge: HTMLElement): void {
  badge.textContent = "...";
  badge.className = "nqf-badge nqf-badge--loading";
  badge.style.backgroundColor = "";
}

function createBadge(score: number): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = "nqf-badge";
  badge.textContent = String(score);
  badge.style.backgroundColor = scoreToColor(score);
  return badge;
}
