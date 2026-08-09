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
