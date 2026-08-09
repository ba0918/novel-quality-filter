export function findMetaArea(cardElement: HTMLElement): HTMLElement | null {
  return cardElement.querySelector<HTMLElement>('[class*="WorkMeta"]') ??
    cardElement.querySelector<HTMLElement>(".widget-workCard-meta");
}

export function findStarCountElement(root: Element): HTMLAnchorElement | null {
  const reviewLinks = root.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/reviews"]',
  );
  for (const link of reviewLinks) {
    if (link.textContent?.includes("★")) return link;
  }
  return null;
}
