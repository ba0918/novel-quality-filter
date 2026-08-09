import { assertEquals } from "@std/assert";
import { extractWorkIds } from "./kakuyomu_listing.ts";

Deno.test("extractWorkIds: リストページの作品リンクから workId を重複なく抽出する", () => {
  const html = `
    <a href="/works/111">作品A</a>
    <a href="/works/222">作品B</a>
    <a href="/works/333">作品C</a>
  `;
  assertEquals(extractWorkIds(html), ["111", "222", "333"]);
});

Deno.test("extractWorkIds: 同一 workId は初出順で1件にまとめる", () => {
  const html = `
    <a href="/works/111">タイトル</a>
    <a href="/works/111">作者リンク</a>
    <a href="/works/222">別作品</a>
    <a href="/works/111">タグ経由</a>
  `;
  assertEquals(extractWorkIds(html), ["111", "222"]);
});

Deno.test("extractWorkIds: エピソードリンクは所属 workId に丸める", () => {
  const html = `
    <a href="/works/111/episodes/999">第1話</a>
    <a href="/works/222">作品B</a>
  `;
  assertEquals(extractWorkIds(html), ["111", "222"]);
});

Deno.test("extractWorkIds: 作品リンクが無ければ空配列", () => {
  assertEquals(extractWorkIds("<div>作品はありません</div>"), []);
});
