import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { LineMetadata, MetricResult, ScoreResult } from "../../src/domain/types.ts";
import { type DossierMeta, renderDossierCard, renderHtmlPage } from "./render_dossier.ts";

const META: DossierMeta = {
  title: "作品タイトル",
  author: "作者名",
  url: "https://kakuyomu.jp/works/1",
  reviewCount: 12,
  totalReviewPoint: 340,
  totalCharacterCount: 50000,
};

function metric(overrides: Partial<MetricResult> = {}): MetricResult {
  return {
    key: "singleSentParaRatio",
    label: "一文一段落比率",
    rawValue: 0.85,
    normalizedValue: 0.15,
    weight: 0.3,
    contribution: 4.5,
    flagged: true,
    reason: "一文一段落比率が 85.0% と高い",
    ...overrides,
  };
}

const LINE_META: LineMetadata = {
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

function result(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    score: 42,
    metrics: [metric()],
    penalties: [{ label: "一文一段落の過多", multiplier: 0.8 }],
    openingType: "normal",
    sampledCount: 1,
    lineMetadata: LINE_META,
    ...overrides,
  };
}

Deno.test("renderDossierCard: メタ情報・スコア・指標内訳・ペナルティ・行メタを含む（C4）", () => {
  const html = renderDossierCard(META, result());
  assertStringIncludes(html, "作品タイトル");
  assertStringIncludes(html, "作者名");
  assertStringIncludes(html, "42"); // スコア
  assertStringIncludes(html, "一文一段落比率"); // 指標ラベル
  assertStringIncludes(html, "85.0%"); // 生値
  assertStringIncludes(html, "15%"); // 正規化値
  assertStringIncludes(html, "一文一段落の過多"); // ペナルティ
  assertStringIncludes(html, "x0.8"); // ペナルティ乗算
  assertStringIncludes(html, "25.0字/行"); // 行メタ 平均字/行
});

Deno.test("renderDossierCard: フラグ付き指標に flag クラスを付ける", () => {
  const flaggedHtml = renderDossierCard(META, result({ metrics: [metric({ flagged: true })] }));
  const cleanHtml = renderDossierCard(META, result({ metrics: [metric({ flagged: false })] }));
  assertStringIncludes(flaggedHtml, "nqf-metric-row--flagged");
  assertEquals(cleanHtml.includes("nqf-metric-row--flagged"), false);
});

Deno.test("renderDossierCard: タイトル・作者の本文由来文字列を HTML エスケープする（XSS/崩れ防止）", () => {
  const html = renderDossierCard(
    { ...META, title: "<script>alert(1)</script>", author: 'a&"b' },
    result(),
  );
  assertEquals(html.includes("<script>alert(1)</script>"), false);
  assertStringIncludes(html, "&lt;script&gt;");
  assertStringIncludes(html, "a&amp;&quot;b");
});

Deno.test("renderDossierCard: 危険なスキームの URL を href として無害化する（XSS防止）", () => {
  const html = renderDossierCard({ ...META, url: "javascript:alert(1)" }, result());
  assertEquals(html.includes(`href="javascript:`), false);
  assertStringIncludes(html, `href="#"`);
});

Deno.test("renderDossierCard: ペナルティが無ければ「なし」を表示する", () => {
  const html = renderDossierCard(META, result({ penalties: [] }));
  assertStringIncludes(html, "なし");
});

Deno.test("renderHtmlPage: タイトルをエスケープして完全な HTML 文書に包む", () => {
  const page = renderHtmlPage("一覧 <x>", "<div>body</div>");
  assert(page.startsWith("<!DOCTYPE html>"));
  assertStringIncludes(page, "<div>body</div>");
  assertStringIncludes(page, "一覧 &lt;x&gt;");
  assertEquals(page.includes("<title>一覧 <x></title>"), false);
});
