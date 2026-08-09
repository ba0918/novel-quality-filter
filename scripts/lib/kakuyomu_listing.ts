// タグ検索など一覧ページの SSR HTML から作品 workId を抽出する（較正クロール用）。
// カクヨムの一覧は作品リンク /works/<id> を SSR で埋め込む（更新順ページで実測 50 件/頁）。

// 作品リンク /works/<id>（/works/<id>/episodes/... も所属 workId に丸める）を初出順・重複なしで返す。
export function extractWorkIds(html: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const m of html.matchAll(/\/works\/(\d+)/g)) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}
