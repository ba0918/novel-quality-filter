import { assertEquals } from "@std/assert";
import { parseHTML } from "linkedom";
import type { ScoreResult } from "../../domain/types.ts";
import { injectBadge } from "./badge-injector.ts";
import { injectWorkBadge } from "./work-page-injector.ts";

function makeResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return { score: 75, metrics: [], penalties: [], ...overrides };
}

function withDocument<T>(html: string, fn: (doc: Document) => T): T {
  const { document } = parseHTML(html);
  const prev = globalThis.document;
  (globalThis as { document: unknown }).document = document;
  try {
    return fn(document);
  } finally {
    (globalThis as { document: unknown }).document = prev;
  }
}

Deno.test("badge-injector: 開幕形式と再評価情報をツールチップ内に表示する", () => {
  withDocument(
    '<div class="widget-work"><a href="/works/1/reviews"><span>★10</span></a></div>',
    (doc) => {
      const card = doc.querySelector<HTMLElement>(".widget-work")!;
      injectBadge(
        card,
        "1",
        makeResult({
          openingType: "character-intro",
          sampledCount: 2,
          targetEpisodeIndex: 1,
        }),
        () => {},
      );
      const context = card.querySelector<HTMLElement>(".nqf-tooltip .nqf-tooltip-context");
      assertEquals(context?.textContent, "キャラ紹介開幕 / 2話で再評価");
    },
  );
});

Deno.test("badge-injector: ネイティブ title は使わずツールチップへ一本化する", () => {
  withDocument(
    '<div class="widget-work"><a href="/works/1/reviews"><span>★10</span></a></div>',
    (doc) => {
      const card = doc.querySelector<HTMLElement>(".widget-work")!;
      injectBadge(card, "1", makeResult({ openingType: "normal", sampledCount: 1 }), () => {});
      const badge = card.querySelector<HTMLElement>(".nqf-badge");
      assertEquals(badge?.title, "");
      const context = card.querySelector<HTMLElement>(".nqf-tooltip .nqf-tooltip-context");
      assertEquals(context?.textContent, "通常開幕");
    },
  );
});

Deno.test("work-page-injector: 開幕形式を detail panel に表示しネイティブ title は使わない", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(
      container,
      makeResult({ openingType: "bulletin-board", sampledCount: 3 }),
      () => {},
    );
    const badge = container.querySelector<HTMLElement>(".nqf-work-badge");
    assertEquals(badge?.title, "");
    const context = container.querySelector<HTMLElement>(".nqf-detail-context");
    assertEquals(context?.textContent, "掲示板開幕");
  });
});
