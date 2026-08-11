import { assert, assertEquals } from "@std/assert";
import { parseHTML } from "linkedom";
import type { LineMetadata, MetricResult, ScoreResult } from "../../domain/types.ts";
import { injectBadge } from "./badge-injector.ts";
import { injectScoreButton, injectWorkBadge } from "./work-page-injector.ts";

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
    short14: 0,
    short20: 1,
    short30: 2,
    chunkCount: 6,
    shortChunk14: 0,
    shortChunk20: 2,
    shortChunk30: 3,
  },
  dialogue: { lineCount: 2, charCount: 30, short14: 0, short20: 2, short30: 2 },
  meta: { lineCount: 1, charCount: 10, short14: 0, short20: 1, short30: 1 },
  nonTerminal: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
};

// 本文が全て空行のとき、平均字/行の分母（総行数−空行数）が0になる退化ケース。
const ALL_BLANK_META: LineMetadata = {
  totalLines: 3,
  totalChars: 50,
  blankCount: 3,
  separatorCount: 0,
  narrative: {
    lineCount: 0,
    charCount: 0,
    short14: 0,
    short20: 0,
    short30: 0,
    chunkCount: 0,
    shortChunk14: 0,
    shortChunk20: 0,
    shortChunk30: 0,
  },
  dialogue: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
  meta: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
  nonTerminal: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
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

Deno.test("work-page-injector: 未スコアもスコア済みも作品ヘッダー行の右端に揃える", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;

    injectScoreButton(container, () => {});
    const button = container.querySelector<HTMLElement>(".nqf-score-button");
    assertEquals(button?.style.marginLeft, "auto");

    injectWorkBadge(container, makeResult(), () => {});
    const wrapper = container.querySelector<HTMLElement>(".nqf-work-wrapper");
    assertEquals(wrapper?.style.marginLeft, "auto");
  });
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

function metric(overrides: Partial<MetricResult> = {}): MetricResult {
  return {
    key: "k",
    label: "指標",
    rawValue: 0.5,
    normalizedValue: 0.5,
    weight: 0.1,
    contribution: 5,
    flagged: false,
    reason: "",
    ...overrides,
  };
}

// createMetricRow の値整形（rawValue の %/実数切替・正規化%・flag 色）を DOM 出力で固定する。
// dossier_format 抽出のリファクタで表示が変わらないことを担保する特性化テスト。
Deno.test("work-page-injector: 指標行が生値（率/実数）と正規化%とフラグ色を表示する", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(
      container,
      makeResult({
        metrics: [
          metric({ label: "率指標", rawValue: 0.234, normalizedValue: 0.8, flagged: false }),
          metric({ label: "実数指標", rawValue: 12.5, normalizedValue: 0.2, flagged: true }),
        ],
      }),
      () => {},
    );

    const rows = container.querySelectorAll<HTMLElement>(".nqf-metric-row");
    assertEquals(rows.length, 2);

    // 1件目: rawValue<1 は百分率、正規化 0.8→80%、非フラグ
    const first = rows[0];
    assert((first.textContent ?? "").includes("率指標"));
    assert((first.querySelector(".nqf-metric-raw")?.textContent ?? "").includes("23.4%"));
    assertEquals(first.querySelector(".nqf-metric-norm")?.textContent, "80%");
    assertEquals(first.classList.contains("nqf-metric-row--flagged"), false);

    // 2件目: rawValue>=1 は実数1桁、正規化 0.2→20%、フラグ色
    const second = rows[1];
    assertEquals(second.querySelector(".nqf-metric-raw")?.textContent, "12.5");
    assertEquals(second.querySelector(".nqf-metric-norm")?.textContent, "20%");
    assertEquals(second.classList.contains("nqf-metric-row--flagged"), true);
  });
});

Deno.test("work-page-injector: 行メタデータのサマリ・見出し・カテゴリ別分量を detail panel に表示する", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(container, makeResult({ lineMetadata: SAMPLE_META }), () => {});

    const section = container.querySelector<HTMLElement>(".nqf-line-metadata");
    assert(section !== null, "行メタデータセクションが表示される");

    // 見出しはトグルボタンに載る
    const toggle = section.querySelector<HTMLElement>(".nqf-lm-toggle");
    assert(toggle?.textContent?.includes("行メタデータ"), "見出しラベルが表示される");

    // サマリ: 総行数・総文字数は実数、空行・区切り線は数＋率
    const summary = section.querySelector<HTMLElement>(".nqf-lm-summary")?.textContent ?? "";
    assert(summary.includes("総行数 10"), "総行数が実数で表示される");
    assert(summary.includes("総文字数 200"), "総文字数が実数で表示される");
    assert(summary.includes("空行 2"), "空行が実数で表示される");
    assert(summary.includes("20%"), "空行率が表示される");
    assert(summary.includes("区切り線 1"), "区切り線が実数で表示される");
    assert(summary.includes("10%"), "区切り率が表示される");

    // 見出しチップ: 平均字/行 と 地の文短行30 の2枚。総合短行率は出さない
    const chips = section.querySelectorAll(".nqf-lm-chip");
    assertEquals(chips.length, 2, "見出しチップは平均字/行と地の文短行30の2枚");
    const headline = section.querySelector<HTMLElement>(".nqf-lm-headline")?.textContent ?? "";
    // 平均字/行 = 総文字数 200 ÷（総行数 10 − 空行 2）= 25.0
    assert(headline.includes("25.0字/行"), "平均字/行チップが算出値で表示される");
    const concern = section.querySelector<HTMLElement>(".nqf-lm-chip--concern");
    assert(
      concern?.textContent?.includes("地の文 短行30"),
      "地の文短行30チップが要注意色で表示される",
    );
    assert(concern?.textContent?.includes("50%"), "地の文短行30率（2/4）が表示される");

    // カテゴリ別: 地の文・セリフ・メタ・非文末の4枚
    const cats = section.querySelectorAll<HTMLElement>(".nqf-lm-cat");
    assertEquals(cats.length, 4, "カテゴリブロックは4枚");

    // 地の文: 行割合 4/10=40.0%・文字割合 120/200=60.0%・短行 0/4,1/4・短チャンク 0/6,2/6
    // Chrome 拡張は 14/20 の 2 数字表示（30 は saturate 判別薄で落とした）。
    const narrative = cats[0];
    assertEquals(narrative.querySelector(".nqf-lm-cat-name")?.textContent, "地の文");
    const nText = narrative.textContent ?? "";
    assert(nText.includes("40.0%"), "地の文の行割合が表示される");
    assert(nText.includes("60.0%"), "地の文の文字割合が表示される");
    assert(nText.includes("25%"), "地の文短行20（1/4）が表示される");
    assert(nText.includes("33%"), "地の文短チャンク20（2/6）が表示される");
    assert(nText.includes("チャンク 6"), "地の文のチャンク数が表示される");
    // 地の文だけが短チャンク行を持つ
    assert(
      narrative.querySelector(".nqf-lm-metric--shortchunk") !== null,
      "地の文には短チャンク行がある",
    );

    // セリフ: 行 2/10=20.0%・文字 30/200=15.0%・短行 2/2=100%、短チャンクは持たない
    const dialogue = cats[1];
    assertEquals(dialogue.querySelector(".nqf-lm-cat-name")?.textContent, "セリフ");
    const dText = dialogue.textContent ?? "";
    assert(dText.includes("15.0%"), "セリフの文字割合が表示される");
    assert(dText.includes("100%"), "セリフの短行率が表示される");
    assertEquals(
      dialogue.querySelector(".nqf-lm-metric--shortchunk"),
      null,
      "セリフには短チャンク行がない",
    );
  });
});

// docs/spec/line-metadata.md「表示」節: 短行率は 14/20/30 を並べて表示する（14 はスコア・
// 警告閾値には参加させないが、較正のため目視で読める場所に置く）。SAMPLE_META とは別に、
// 14 に非ゼロの値を持たせて distinct な percent を出せるフィクスチャを組む。
const SHORT14_META: LineMetadata = {
  totalLines: 10,
  totalChars: 200,
  blankCount: 0,
  separatorCount: 0,
  narrative: {
    // 行 5 / 短行14 3 (60%) / 短行20 4 (80%) / 短行30 5 (100%)
    // チャンク 8 / 短チャンク14 2 (25%) / 短チャンク20 4 (50%) / 短チャンク30 6 (75%)
    lineCount: 5,
    charCount: 100,
    short14: 3,
    short20: 4,
    short30: 5,
    chunkCount: 8,
    shortChunk14: 2,
    shortChunk20: 4,
    shortChunk30: 6,
  },
  dialogue: { lineCount: 5, charCount: 100, short14: 0, short20: 0, short30: 0 },
  meta: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
  nonTerminal: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
};

Deno.test("work-page-injector: カテゴリカードの短行/短チャンクを 14:X / 20:Y の 2 数字で並列表示する（30 は表示しない）", () => {
  // 30 は既存作品の分布で saturate しており（良/駄ともに 76%〜99% の帯に集中して判別力が薄い）、
  // 数字を狭い value 列に 3 つ並べるとレイアウトが崩れる。data (dataset.jsonl / cal.json) には
  // 30 も残すが、Chrome 拡張の作品ページ表示からは落とす。docs/spec/line-metadata.md「表示」節参照。
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(container, makeResult({ lineMetadata: SHORT14_META }), () => {});

    const narrative = container.querySelectorAll<HTMLElement>(".nqf-lm-cat")[0];

    const shortRow = narrative.querySelector<HTMLElement>(".nqf-lm-metric--short");
    const shortText = shortRow?.textContent ?? "";
    assert(
      /14:\s*60%\s*\/\s*20:\s*80%/.test(shortText),
      `短行が 14/20 の順で並ぶ (実際: ${shortText})`,
    );
    assert(
      !/30:/.test(shortText),
      `短行の表示に「30:」が含まれない (実際: ${shortText})`,
    );

    const chunkRow = narrative.querySelector<HTMLElement>(".nqf-lm-metric--shortchunk");
    const chunkText = chunkRow?.textContent ?? "";
    assert(
      /14:\s*25%\s*\/\s*20:\s*50%/.test(chunkText),
      `短チャンクが 14/20 の順で並ぶ (実際: ${chunkText})`,
    );
    assert(
      !/30:/.test(chunkText),
      `短チャンクの表示に「30:」が含まれない (実際: ${chunkText})`,
    );
  });
});

Deno.test("work-page-injector: 行メタデータはデフォルト畳みで、トグルで開閉できる", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(container, makeResult({ lineMetadata: SAMPLE_META }), () => {});

    const toggle = container.querySelector<HTMLButtonElement>(".nqf-lm-toggle")!;
    const body = container.querySelector<HTMLElement>(".nqf-lm-body")!;

    assert(body.hasAttribute("hidden"), "初期状態は畳み（body が hidden）");
    assertEquals(toggle.getAttribute("aria-expanded"), "false", "初期は aria-expanded=false");

    toggle.click();
    assert(!body.hasAttribute("hidden"), "トグルで body が開く");
    assertEquals(toggle.getAttribute("aria-expanded"), "true", "開くと aria-expanded=true");

    toggle.click();
    assert(body.hasAttribute("hidden"), "再度トグルで body が畳まれる");
    assertEquals(toggle.getAttribute("aria-expanded"), "false", "畳むと aria-expanded=false");
  });
});

Deno.test("work-page-injector: 行メタデータのダイジェストを見出し右に表示する", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(container, makeResult({ lineMetadata: SAMPLE_META }), () => {});

    // 畳んだままでも読めるダイジェスト（平均字/行・空行率）
    const peek = container.querySelector<HTMLElement>(".nqf-lm-peek")?.textContent ?? "";
    assert(peek.includes("25.0字/行"), "ダイジェストに平均字/行が出る");
    assert(peek.includes("20%"), "ダイジェストに空行率が出る");
  });
});

Deno.test("work-page-injector: 平均字/行の分母が0でも行メタデータが破綻しない", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(container, makeResult({ lineMetadata: ALL_BLANK_META }), () => {});

    const section = container.querySelector<HTMLElement>(".nqf-line-metadata");
    assert(section !== null, "退化ケースでもセクションは表示される");

    const text = section.textContent ?? "";
    assert(!text.includes("NaN"), "NaN が漏れない");
    assert(!text.includes("Infinity"), "Infinity が漏れない");

    // 分母0の平均字/行は退避表示（"-"）になる
    const peek = section.querySelector<HTMLElement>(".nqf-lm-peek")?.textContent ?? "";
    assert(peek.includes("-"), "平均字/行が退避表示になる");
  });
});

Deno.test("work-page-injector: lineMetadata が無ければ行メタデータセクションを出さない", () => {
  withDocument("<div class='container'></div>", (doc) => {
    const container = doc.querySelector<HTMLElement>(".container")!;
    injectWorkBadge(container, makeResult(), () => {});
    assertEquals(container.querySelector(".nqf-line-metadata"), null);
  });
});
