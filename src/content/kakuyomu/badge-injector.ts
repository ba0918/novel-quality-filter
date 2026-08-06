import type { ScoreResult } from "../../domain/types.ts";
import { DEFAULT_THRESHOLD } from "../../domain/scoring/mod.ts";

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

  const titleLink = cardElement.querySelector('a[href*="/works/"]');
  if (titleLink) {
    titleLink.parentElement?.insertBefore(badge, titleLink.nextSibling);
  } else {
    cardElement.appendChild(badge);
  }

  if (result.score <= DEFAULT_THRESHOLD) {
    cardElement.classList.add("nqf-suspect");
  } else {
    cardElement.classList.remove("nqf-suspect");
  }
}

export function injectLoadingBadge(cardElement: HTMLElement): void {
  removeBadge(cardElement);

  const badge = document.createElement("span");
  badge.className = "nqf-badge nqf-badge--loading";
  badge.textContent = "...";

  const titleLink = cardElement.querySelector('a[href*="/works/"]');
  if (titleLink) {
    titleLink.parentElement?.insertBefore(badge, titleLink.nextSibling);
  } else {
    cardElement.appendChild(badge);
  }
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

function createTooltip(result: ScoreResult): HTMLSpanElement {
  const tooltip = document.createElement("span");
  tooltip.className = "nqf-tooltip";

  const flagged = result.metrics.filter((m) => m.flagged);
  if (flagged.length === 0) {
    tooltip.textContent = "問題なし";
    return tooltip;
  }

  for (const m of flagged) {
    const line = document.createElement("span");
    line.className = "nqf-tooltip-line";
    line.textContent = `⚠ ${m.reason}`;
    tooltip.appendChild(line);
  }

  return tooltip;
}

function scoreToColor(score: number): string {
  let hue: number;
  if (score <= 35) {
    hue = 0;
  } else if (score <= 65) {
    hue = ((score - 35) / 30) * 40;
  } else {
    hue = 40 + ((score - 65) / 35) * 80;
  }

  const saturation = score <= 35 ? 70 : 55;
  const lightness = score <= 35 ? 45 : 38;
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}
