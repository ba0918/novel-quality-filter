import { buildWorkUrl } from "./work-page-detector.ts";

const WORK_URL_PATTERN = /\/works\/(\d+)/;
const PROCESSED_ATTR = "data-nqf-scored";
const DEBOUNCE_MS = 200;

// カードコンテナの判定に使う共通セレクタ。ページ種別ごとに if 分岐せず、この配列を順に試す。
// 新しいページ種別はここにセレクタを追記するだけで済む。
// 検索ページの WorkMeta は二段階解決（WorkMeta 検出 → NewBox ボックス解決）が必要なため、
// 配列には含めず findCardContainer 内で個別に処理する。
const CARD_CONTAINER_SELECTORS = [
  'li[class*="Rankings_"]', // ランキング
  "div.widget-work.float-parent", // タグ・新着小説・ピックアップ
  "div.widget-reviewsItem-workCard", // 新着レビュー
];

export interface WorkCard {
  workId: string;
  workUrl: string;
  cardElement: HTMLElement;
}

export function detectWorkCards(root: Element = document.body): WorkCard[] {
  const cards: WorkCard[] = [];
  const workLinks = root.querySelectorAll<HTMLAnchorElement>('a[href*="/works/"]');

  const seenWorkIds = new Set<string>();
  const seenElements = new Set<HTMLElement>();

  for (const link of workLinks) {
    const href = link.getAttribute("href");
    if (!href) continue;

    const match = href.match(WORK_URL_PATTERN);
    if (!match) continue;

    const workId = match[1];
    if (seenWorkIds.has(workId)) continue;

    if (href.includes("/reviews") || href.includes("/episodes")) continue;

    const cardElement = findCardContainer(link);
    if (!cardElement) continue;
    if (cardElement.hasAttribute(PROCESSED_ATTR)) continue;
    if (seenElements.has(cardElement)) continue;

    seenWorkIds.add(workId);
    seenElements.add(cardElement);
    cards.push({
      workId,
      workUrl: buildWorkUrl(workId),
      cardElement,
    });
  }

  return cards;
}

export function markAsProcessed(cardElement: HTMLElement): void {
  cardElement.setAttribute(PROCESSED_ATTR, "true");
}

export function findCardContainer(link: HTMLAnchorElement): HTMLElement | null {
  // ランキングアイテム（通常 + プロモーション枠）
  const rankingItem = link.closest<HTMLElement>(CARD_CONTAINER_SELECTORS[0]);
  if (rankingItem) return rankingItem;

  // 検索ページ等: WorkMeta を含む最小のボーダー付きボックス
  const workMetaBox = findWorkMetaBox(link);
  if (workMetaBox) return workMetaBox;

  // widget-work 系（タグ・新着小説・ピックアップ）と新着レビュー
  for (const selector of CARD_CONTAINER_SELECTORS.slice(1)) {
    const container = link.closest<HTMLElement>(selector);
    if (container) return container;
  }

  // 汎用フォールバック
  const article = link.closest<HTMLElement>("article, section");
  if (article) return article;

  return link.closest<HTMLElement>("li") ?? link.parentElement;
}

function findWorkMetaBox(link: HTMLAnchorElement): HTMLElement | null {
  const workMeta = link.closest<HTMLElement>('[class*="WorkMeta"]') ??
    findSiblingWithClass(link, "WorkMeta");
  if (workMeta) {
    const box = workMeta.closest<HTMLElement>('[class*="NewBox_box"][class*="borderSize"]');
    if (box) return box;
  }
  return null;
}

function findSiblingWithClass(el: HTMLElement, classFragment: string): HTMLElement | null {
  let parent = el.parentElement;
  for (let depth = 0; depth < 6 && parent; depth++) {
    const found = parent.querySelector<HTMLElement>(`[class*="${classFragment}"]`);
    if (found) return found;
    parent = parent.parentElement;
  }
  return null;
}

export function observeNewCards(
  callback: (cards: WorkCard[]) => void,
): MutationObserver {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver((mutations) => {
    const hasRelevantNodes = mutations.some((m) =>
      Array.from(m.addedNodes).some(
        (node) =>
          node instanceof HTMLElement &&
          (node.querySelector('a[href*="/works/"]') ||
            node.matches?.('a[href*="/works/"]')),
      )
    );

    if (!hasRelevantNodes) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const cards = detectWorkCards();
      if (cards.length > 0) callback(cards);
    }, DEBOUNCE_MS);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}
