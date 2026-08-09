import { assertEquals } from "@std/assert";
import { parseHTML } from "linkedom";
import { detectWorkCards, findCardContainer } from "./card-detector.ts";
import { loadFixture } from "../../../tests/helpers.ts";

function firstTitleLink(document: Document): HTMLAnchorElement {
  const link = document.querySelector<HTMLAnchorElement>(".widget-workCard-title a");
  if (!link) throw new Error("title link not found");
  return link;
}

function parseInline(html: string): Document {
  const { document } = parseHTML(html);
  return document;
}

// ランキング・検索ページは取得 HTML が手元にないため、既存セレクタの回帰確認として
// 実ページの構造を再現した最小 HTML で検証する。
const RANKINGS_PAGE_HTML = `<!DOCTYPE html>
<html>
<body>
  <ol class="Rankings_list">
    <li class="Rankings_rankingItem">
      <div class="widget-workCard">
        <h3 class="widget-workCard-title">
          <a class="widget-workCard-titleLabel" href="/works/16818093085498516000">異世界の歩き方</a>
        </h3>
      </div>
    </li>
  </ol>
</body>
</html>`;

const SEARCH_PAGE_HTML = `<!DOCTYPE html>
<html>
<body>
  <div class="NewBox_box borderSize-small">
    <div class="WorkMeta workMeta_workCard">
      <h3 class="widget-workCard-title">
        <a class="widget-workCard-titleLabel" href="/works/16818093085498516000">異世界の歩き方</a>
      </h3>
    </div>
  </div>
</body>
</html>`;

Deno.test("linkedom smoke: parses tags fixture and finds widget-work cards", () => {
  const document = loadFixture("kakuyomu-tags-page.html");
  const cards = document.querySelectorAll("div.widget-work.float-parent");
  assertEquals(cards.length, 3);
});

Deno.test("findCardContainer: returns widget-work container on tags page", () => {
  const document = loadFixture("kakuyomu-tags-page.html");
  const link = firstTitleLink(document);
  const container = findCardContainer(link);
  assertEquals(container?.matches("div.widget-work.float-parent"), true);
});

Deno.test("findCardContainer: returns widget-reviewsItem-workCard container on reviews page", () => {
  const document = loadFixture("kakuyomu-recent-reviews-page.html");
  const link = firstTitleLink(document);
  const container = findCardContainer(link);
  assertEquals(container?.matches("div.widget-reviewsItem-workCard"), true);
});

Deno.test("findCardContainer: returns widget-work container on recent works page", () => {
  const document = loadFixture("kakuyomu-recent-works-page.html");
  const link = firstTitleLink(document);
  const container = findCardContainer(link);
  assertEquals(container?.matches("div.widget-work.float-parent"), true);
});

Deno.test("findCardContainer: returns widget-work container on pickup page", () => {
  const document = loadFixture("kakuyomu-pickup-page.html");
  const link = firstTitleLink(document);
  const container = findCardContainer(link);
  assertEquals(container?.matches("div.widget-work.float-parent"), true);
});

Deno.test("detectWorkCards: extracts unique workIds from tags page", () => {
  const document = loadFixture("kakuyomu-tags-page.html");
  const cards = detectWorkCards(document.body);
  const workIds = cards.map((c) => c.workId);
  assertEquals(new Set(workIds).size, workIds.length);
  assertEquals(workIds.length, 3);
  assertEquals(workIds[0], "1111111111111111101");
});

Deno.test("detectWorkCards: each card container is the widget-work div", () => {
  const document = loadFixture("kakuyomu-tags-page.html");
  const cards = detectWorkCards(document.body);
  assertEquals(cards.length, 3);
  for (const card of cards) {
    assertEquals(card.cardElement.matches("div.widget-work.float-parent"), true);
  }
});

Deno.test("detectWorkCards: detects cards on reviews page with unique workIds", () => {
  const document = loadFixture("kakuyomu-recent-reviews-page.html");
  const cards = detectWorkCards(document.body);
  const workIds = cards.map((c) => c.workId);
  assertEquals(workIds.length, 3);
  assertEquals(new Set(workIds).size, workIds.length);
  assertEquals(cards[0].workId, "1111111111111111301");
  assertEquals(
    cards[0].cardElement.matches("div.widget-reviewsItem-workCard"),
    true,
  );
});

Deno.test("findCardContainer: rankings container (li[class*=Rankings_]) still resolves", () => {
  const document = parseInline(RANKINGS_PAGE_HTML);
  const link = document.querySelector<HTMLAnchorElement>('a[href*="/works/"]');
  if (!link) throw new Error("work link not found");
  const container = findCardContainer(link);
  assertEquals(container?.matches('li[class*="Rankings_"]'), true);
});

Deno.test("findCardContainer: search page WorkMeta + NewBox container still resolves", () => {
  const document = parseInline(SEARCH_PAGE_HTML);
  const link = document.querySelector<HTMLAnchorElement>('a[href*="/works/"]');
  if (!link) throw new Error("work link not found");
  const container = findCardContainer(link);
  assertEquals(container?.matches('[class*="NewBox_box"][class*="borderSize"]'), true);
});

Deno.test("findCardContainer: generic fallback returns article for bare anchor", () => {
  const document = parseInline(
    `<article><a href="/works/123456">タイトル</a></article>`,
  );
  const link = document.querySelector<HTMLAnchorElement>("a");
  if (!link) throw new Error("work link not found");
  const container = findCardContainer(link);
  assertEquals(container?.tagName.toLowerCase(), "article");
});
