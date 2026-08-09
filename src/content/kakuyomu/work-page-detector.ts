const WORK_PAGE_PATTERN = /^\/works\/(\d+)\/?$/;
const KAKUYOMU_BASE = "https://kakuyomu.jp";

/**
 * URL パス名から作品ページかどうかを判定し、workId を返す。
 * エピソードページ・レビューページなどは除外する。
 */
export function detectWorkPage(pathname: string): string | null {
  const match = pathname.match(WORK_PAGE_PATTERN);
  return match ? match[1] : null;
}

export function buildWorkUrl(workId: string): string {
  return `${KAKUYOMU_BASE}/works/${workId}`;
}

/**
 * 作品ページのヘッダー行（バッジ注入先）を探す。他作品のリンクを掴まないよう
 * 対象 workId の自リンクを優先し、それが無い★0作品では作品自身の★表示行へフォールバックする。
 */
export function findWorkPageContainer(root: ParentNode, workId: string): HTMLElement | null {
  // この作品の★数リンクを探す（他作品のレビューリンクを除外）
  const reviewLink = root.querySelector<HTMLAnchorElement>(
    `a[href$="/works/${workId}/reviews"]`,
  );
  if (reviewLink) {
    const layoutRow = reviewLink.closest<HTMLElement>('[class*="Layout_layout"]');
    if (layoutRow) return layoutRow;
    if (reviewLink.parentElement) return reviewLink.parentElement;
  }

  // フォールバック1: フォロワーリンクから★数を含む親行を探す
  const followerLink = root.querySelector<HTMLAnchorElement>(
    `a[href*="/works/${workId}/followers"]`,
  );
  if (followerLink) {
    const innerRow = followerLink.closest<HTMLElement>('[class*="Layout_layout"]');
    const topRow = innerRow?.parentElement?.closest<HTMLElement>('[class*="Layout_layout"]');
    if (topRow) return topRow;
    if (innerRow) return innerRow;
  }

  // フォールバック2: ★0 の作品はレビュー/フォロワーの自リンクが張られない。
  // 作品自身の★表示（星単独の要素）はカウント0でも必ず在るのでそこを掴む。
  // 推薦枠の★は「★98」のようにカウントが同一要素に埋まる（textContent が "★" 単独でない）ため衝突しない。
  const starIcon = findWorkStarIcon(root);
  if (starIcon) {
    const layoutRow = starIcon.closest<HTMLElement>('[class*="Layout_layout"]');
    if (layoutRow) return layoutRow;
    if (starIcon.parentElement) return starIcon.parentElement;
  }

  return null;
}

function findWorkStarIcon(root: ParentNode): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>("div")) {
    if (el.childElementCount === 0 && el.textContent?.trim() === "★") return el;
  }
  return null;
}
