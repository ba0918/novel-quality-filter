import { assertEquals } from "@std/assert";
import { parseHTML } from "linkedom";
import { detectWorkPage, findWorkPageContainer } from "./work-page-detector.ts";

function doc(html: string): Document {
  return parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`)
    .document as unknown as Document;
}

Deno.test("findWorkPageContainer: ★数リンクがあればその作品ヘッダー行を返す", () => {
  const d = doc(
    `<div class="Layout_layout__A" data-want="1"><a href="/works/123/reviews">★ 98</a></div>`,
  );
  const c = findWorkPageContainer(d, "123");
  assertEquals(c?.getAttribute("data-want"), "1");
});

Deno.test("findWorkPageContainer: ★0でレビュー/フォロワー自リンクが無くても作品の★表示行を掴む", () => {
  // 実ページ再現: 作品自身の★は星単独の要素。推薦枠の★はカウントが同一要素に埋まり衝突しない。
  const d = doc(
    `<div class="Layout_layout__H Layout_gap-5s__R" data-want="1"><div>★</div><div class="LayoutItem_x">0</div></div>` +
      `<div class="Recommend_box"><span>★98</span></div>`,
  );
  const c = findWorkPageContainer(d, "123");
  assertEquals(c?.getAttribute("data-want"), "1");
});

Deno.test("findWorkPageContainer: 作品の自リンクも★表示も無ければ null", () => {
  const d = doc(`<div class="Recommend_box"><span>★98</span></div>`);
  assertEquals(findWorkPageContainer(d, "123"), null);
});

Deno.test("work_page_detector: detects work page and extracts workId", () => {
  const result = detectWorkPage("/works/16818093085498516000");
  assertEquals(result, "16818093085498516000");
});

Deno.test("work_page_detector: detects work page with trailing slash", () => {
  const result = detectWorkPage("/works/16818093085498516000/");
  assertEquals(result, "16818093085498516000");
});

Deno.test("work_page_detector: rejects episode page", () => {
  const result = detectWorkPage("/works/16818093085498516000/episodes/16818093085521654000");
  assertEquals(result, null);
});

Deno.test("work_page_detector: rejects reviews page", () => {
  const result = detectWorkPage("/works/16818093085498516000/reviews");
  assertEquals(result, null);
});

Deno.test("work_page_detector: rejects rankings page", () => {
  const result = detectWorkPage("/rankings/daily");
  assertEquals(result, null);
});

Deno.test("work_page_detector: rejects search page", () => {
  const result = detectWorkPage("/search?q=test");
  assertEquals(result, null);
});

Deno.test("work_page_detector: rejects root page", () => {
  const result = detectWorkPage("/");
  assertEquals(result, null);
});

Deno.test("work_page_detector: rejects works listing page", () => {
  const result = detectWorkPage("/works");
  assertEquals(result, null);
});
