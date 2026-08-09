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

Deno.test("findWorkPageContainer: ★0でも作品の★を掴み、右寄せが効く幅広ヘッダー行（★の内側行でなく親行）を返す", () => {
  // 実ページ再現: 星単独の★行(gap-5s)は幅が狭く margin-left:auto が効かない。
  // レビュー有りと表示位置を揃えるため、その親の幅広 Layout 行を返す。
  // 推薦枠の★はカウントが同一要素に埋まり（textContent が "★" 単独でない）衝突しない。
  const d = doc(
    `<div class="Layout_layout__outer Layout_gap-m__x" data-want="1">` +
      `<div><div class="Layout_layout__inner Layout_gap-5s__y" data-inner="1"><div>★</div><div class="LayoutItem_x">0</div></div></div>` +
      `</div>` +
      `<div class="Recommend_box"><span>★98</span></div>`,
  );
  const c = findWorkPageContainer(d, "123");
  assertEquals(c?.getAttribute("data-want"), "1");
  assertEquals(c?.getAttribute("data-inner"), null);
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
