import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import {
  extractEpisodeTitle,
  extractNextEpisodeUrl,
  extractTextFromHtml,
  resolveEpisodeUrl,
} from "./kakuyomu.ts";

Deno.test("extractEpisodeTitle: widget-episodeTitle からタイトルを抽出", () => {
  const html =
    '<h1 class="widget-episodeTitle js-vertical-composition-item">キャラ紹介　（ネタバレ含みます）</h1>';
  assertEquals(extractEpisodeTitle(html), "キャラ紹介　（ネタバレ含みます）");
});

Deno.test("extractEpisodeTitle: 見つからない場合は null", () => {
  const html = "<html><body><h1>その他</h1></body></html>";
  assertStrictEquals(extractEpisodeTitle(html), null);
});

Deno.test("extractNextEpisodeUrl: contentMain-readNextEpisode アンカーから抽出", () => {
  const html =
    '<a href="/works/2912051596065833171/episodes/2912051596069085261" id="contentMain-readNextEpisode" class="js-read-next-episode">次へ</a>';
  assertEquals(
    extractNextEpisodeUrl(html),
    "/works/2912051596065833171/episodes/2912051596069085261",
  );
});

Deno.test("extractNextEpisodeUrl: link rel=next から抽出（フォールバック）", () => {
  const html = '<link rel="next" href="https://kakuyomu.jp/works/1/episodes/2" />';
  assertEquals(extractNextEpisodeUrl(html), "https://kakuyomu.jp/works/1/episodes/2");
});

Deno.test("extractNextEpisodeUrl: 次話リンクが無い場合は null", () => {
  const html = '<link rel="canonical" href="https://kakuyomu.jp/works/1/episodes/1" />';
  assertStrictEquals(extractNextEpisodeUrl(html), null);
});

Deno.test("extractTextFromHtml: 本文をテキスト化", () => {
  const html =
    '<div class="widget-episodeBody"><p>あいうえお</p><br><p>かきくけこ<br>さしすせそ</p></div>';
  assertEquals(extractTextFromHtml(html), "あいうえお\n\nかきくけこ\nさしすせそ");
});

Deno.test("extractTextFromHtml: プリティプリントHTMLのタグ間改行を段落境界にしない", () => {
  const html = [
    '<div class="widget-episodeBody">',
    "<p>あいうえお。</p>",
    "<p>かきくけこ。</p>",
    '<p class="blank"><br /></p>',
    "<p>さしすせそ。</p>",
    "</div>",
  ].join("\n");
  assertEquals(
    extractTextFromHtml(html),
    "あいうえお。\nかきくけこ。\n\nさしすせそ。",
  );
});

Deno.test("extractTextFromHtml: ルビのふりがなを本文に含めない", () => {
  const html =
    '<div class="widget-episodeBody"><p><ruby><rb>櫛名</rb><rp>（</rp><rt>くしな</rt><rp>）</rp></ruby>雫が走る。</p></div>';
  assertEquals(extractTextFromHtml(html), "櫛名雫が走る。");
});

Deno.test("extractTextFromHtml: 本文が無い場合はエラー", () => {
  const html = "<html><body><p>1</p><p>2</p><p>3</p></body></html>";
  assertThrows(() => extractTextFromHtml(html));
});

Deno.test("resolveEpisodeUrl: 相対パスを kakuyomu.jp の絶対 URL に解決", () => {
  const url = resolveEpisodeUrl("/works/2912051596065833171/episodes/2912051596069085261");
  assertEquals(
    url.href,
    "https://kakuyomu.jp/works/2912051596065833171/episodes/2912051596069085261",
  );
});

Deno.test("resolveEpisodeUrl: kakuyomu.jp の絶対 URL をそのまま使用", () => {
  const url = resolveEpisodeUrl("https://kakuyomu.jp/works/1/episodes/2");
  assertEquals(url.href, "https://kakuyomu.jp/works/1/episodes/2");
});

Deno.test("resolveEpisodeUrl: 他ホストの URL は拒否", () => {
  assertThrows(() => resolveEpisodeUrl("https://evil.example.com/works/1/episodes/2"));
});
