const WORK_URL_PATTERN = /\/works\/(\d+)/;
const PROCESSED_ATTR = "data-nqf-scored";
const DEBOUNCE_MS = 200;

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
      workUrl: `https://kakuyomu.jp/works/${workId}`,
      cardElement,
    });
  }

  return cards;
}

export function markAsProcessed(cardElement: HTMLElement): void {
  cardElement.setAttribute(PROCESSED_ATTR, "true");
}

function findCardContainer(link: HTMLAnchorElement): HTMLElement | null {
  // カクヨムのランキングアイテム（通常 + プロモーション枠）
  const rankingItem = link.closest<HTMLElement>('li[class*="Rankings_"]');
  if (rankingItem) return rankingItem;

  // 検索ページ等: WorkMeta を含む最小のボーダー付きボックス
  const workMeta = link.closest<HTMLElement>('[class*="WorkMeta"]') ??
    findSiblingWithClass(link, "WorkMeta");
  if (workMeta) {
    const box = workMeta.closest<HTMLElement>('[class*="NewBox_box"][class*="borderSize"]');
    if (box) return box;
  }

  // 汎用フォールバック
  const article = link.closest<HTMLElement>("article, section");
  if (article) return article;

  return link.closest<HTMLElement>("li") ?? link.parentElement;
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
