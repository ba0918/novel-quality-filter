import { assert, assertEquals } from "@std/assert";
import { parseHTML } from "linkedom";
import type { LineMetadata, ScoreResult } from "../../domain/types.ts";
import { injectBadge } from "./badge-injector.ts";
import { injectWorkBadge } from "./work-page-injector.ts";

function makeResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return { score: 75, metrics: [], penalties: [], ...overrides };
}

const SAMPLE_META: LineMetadata = {
  totalLines: 10,
  totalChars: 200,
  blankCount: 2,
  separatorCount: 1,
  narrative: {
    lineCount: 4,
    charCount: 120,
    short20: 1,
    short30: 2,
    chunkCount: 6,
    shortChunk20: 2,
    shortChunk30: 3,
  },
  dialogue: { lineCount: 2, charCount: 30, short20: 2, short30: 2 },
  meta: { lineCount: 1, charCount: 10, short20: 1, short30: 1 },
  nonTerminal: { lineCount: 0, charCount: 0, short20: 0, short30: 0 },
};

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

Deno.test("work-page-injector: 行メタデータのカテゴリ別分量を detail panel に表示する", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(container, makeResult({ lineMetadata: SAMPLE_META }), () => {});

    const section = container.querySelector<HTMLElement>(".nqf-line-metadata");
    assert(section !== null, "行メタデータセクションが表示される");

    const title = section.querySelector<HTMLElement>(".nqf-detail-section-title");
    assertEquals(title?.textContent, "行メタデータ");

    const summary = section.querySelector<HTMLElement>(".nqf-line-summary");
    assert(summary?.textContent?.includes("総行数 10"), "総行数が表示される");

    const rows = section.querySelectorAll(".nqf-line-row");
    assertEquals(rows.length, 4);
    const firstLabel = rows[0].querySelector(".nqf-line-label");
    assertEquals(firstLabel?.textContent, "地の文");
  });
});

Deno.test("work-page-injector: lineMetadata が無ければ行メタデータセクションを出さない", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(container, makeResult(), () => {});
    assertEquals(container.querySelector(".nqf-line-metadata"), null);
  });
});
