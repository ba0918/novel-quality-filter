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

Deno.test("badge-injector: 再評価情報を title に設定", () => {
  withDocument(
    '<div class="widget-work"><a href="/works/1/reviews"><span>★10</span></a></div>',
    (doc) => {
      const card = doc.querySelector<HTMLElement>(".widget-work")!;
      injectBadge(
        card,
        "1",
        makeResult({ openingType: "character-intro", sampledCount: 2 }),
        () => {},
      );
      const badge = card.querySelector<HTMLElement>(".nqf-badge");
      assertEquals(badge?.title, "キャラ紹介開幕 / 2話で再評価");
    },
  );
});

Deno.test("badge-injector: 通常開幕はラベルのみを title に設定", () => {
  withDocument(
    '<div class="widget-work"><a href="/works/1/reviews"><span>★10</span></a></div>',
    (doc) => {
      const card = doc.querySelector<HTMLElement>(".widget-work")!;
      injectBadge(card, "1", makeResult({ openingType: "normal", sampledCount: 1 }), () => {});
      const badge = card.querySelector<HTMLElement>(".nqf-badge");
      assertEquals(badge?.title, "通常開幕");
    },
  );
});

Deno.test("work-page-injector: バッジの title に形式ラベルを設定", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(
      container,
      makeResult({ openingType: "bulletin-board", sampledCount: 3 }),
      () => {},
    );
    const badge = container.querySelector<HTMLElement>(".nqf-work-badge");
    assertEquals(badge?.title, "掲示板開幕 / 3話で再評価");
  });
});
