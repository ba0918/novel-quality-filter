import { assertEquals } from "@std/assert";
import { parseHTML } from "linkedom";
import { findStarCountElement } from "./meta-element.ts";

function loadFixture(name: string): Document {
  const html = Deno.readTextFileSync(`tests/fixtures/${name}`);
  const { document } = parseHTML(html);
  return document;
}

function firstWorkCard(document: Document): HTMLElement {
  const card = document.querySelector<HTMLElement>(
    "div.widget-work.float-parent, div.widget-reviewsItem-workCard",
  );
  if (!card) throw new Error("work card not found");
  return card;
}

Deno.test("findStarCountElement: finds star link in tags page card", () => {
  const document = loadFixture("kakuyomu-tags-page.html");
  const link = findStarCountElement(firstWorkCard(document));
  assertEquals(link?.getAttribute("href"), "/works/1111111111111111101/reviews");
  assertEquals(link?.textContent?.includes("★"), true);
});

Deno.test("findStarCountElement: finds star link in recent works page card", () => {
  const document = loadFixture("kakuyomu-recent-works-page.html");
  const link = findStarCountElement(firstWorkCard(document));
  assertEquals(link?.textContent?.includes("★"), true);
});

Deno.test("findStarCountElement: finds star link in pickup page card", () => {
  const document = loadFixture("kakuyomu-pickup-page.html");
  const link = findStarCountElement(firstWorkCard(document));
  assertEquals(link?.textContent?.includes("★"), true);
});

Deno.test("findStarCountElement: finds star link in recent reviews page card", () => {
  const document = loadFixture("kakuyomu-recent-reviews-page.html");
  const link = findStarCountElement(firstWorkCard(document));
  assertEquals(link?.textContent?.includes("★"), true);
});
