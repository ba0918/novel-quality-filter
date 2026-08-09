export function findStarCountElement(root: Element): HTMLAnchorElement | null {
  const reviewLinks = root.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/reviews"]',
  );
  for (const link of reviewLinks) {
    if (link.textContent?.includes("★")) return link;
  }
  return null;
}

export function findStarOrFollowerElement(root: Element): HTMLElement | null {
  const star = findStarCountElement(root);
  if (star) return star;

  const followerLinks = root.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/followers"]',
  );
  for (const link of followerLinks) {
    return link;
  }
  return null;
}
