import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import {
  extractEpisodeTitle,
  extractFirstEpisodePath,
  extractLinesFromHtml,
  extractNextEpisodeUrl,
  extractTextFromHtml,
  extractWorkMetadata,
  parseTargetUrl,
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

Deno.test("extractLinesFromHtml: blank クラスの <p> を空行として isBlank=true で残す", () => {
  const html =
    '<div class="widget-episodeBody"><p>あいうえお。</p><p class="blank"><br /></p><p>さしすせそ。</p></div>';
  assertEquals(extractLinesFromHtml(html), [
    { text: "あいうえお。", isBlank: false },
    { text: "", isBlank: true },
    { text: "さしすせそ。", isBlank: false },
  ]);
});

Deno.test("extractLinesFromHtml: 連続空行を圧縮せず各 <p> を1要素として保持する", () => {
  const html = [
    '<div class="widget-episodeBody">',
    "<p>あ。</p>",
    '<p class="blank"><br /></p>',
    '<p class="blank"><br /></p>',
    "<p>い。</p>",
    "</div>",
  ].join("\n");
  assertEquals(extractLinesFromHtml(html), [
    { text: "あ。", isBlank: false },
    { text: "", isBlank: true },
    { text: "", isBlank: true },
    { text: "い。", isBlank: false },
  ]);
});

Deno.test("extractLinesFromHtml: ルビの <rt>/<rp> を除去し base（漢字）を残す", () => {
  const html =
    '<div class="widget-episodeBody"><p><ruby><rb>櫛名</rb><rp>（</rp><rt>くしな</rt><rp>）</rp></ruby>雫が走る。</p></div>';
  assertEquals(extractLinesFromHtml(html), [
    { text: "櫛名雫が走る。", isBlank: false },
  ]);
});

Deno.test("extractLinesFromHtml: 本文領域が無ければ空配列（診断はスコアを止めない）", () => {
  assertEquals(extractLinesFromHtml("<html><body><p>1</p></body></html>"), []);
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

Deno.test("parseTargetUrl: 作品ページ URL から workId を取り出す（episodeId は null）", () => {
  assertEquals(parseTargetUrl("https://kakuyomu.jp/works/123"), {
    workId: "123",
    episodeId: null,
  });
});

Deno.test("parseTargetUrl: エピソード URL から workId と episodeId を取り出す", () => {
  assertEquals(parseTargetUrl("https://kakuyomu.jp/works/123/episodes/456"), {
    workId: "123",
    episodeId: "456",
  });
});

Deno.test("parseTargetUrl: 他ホストの URL は拒否", () => {
  assertThrows(() => parseTargetUrl("https://evil.example.com/works/123"));
});

Deno.test("parseTargetUrl: works を含まない URL は拒否", () => {
  assertThrows(() => parseTargetUrl("https://kakuyomu.jp/"));
});

Deno.test("extractFirstEpisodePath: 指定 workId の最初のエピソードパスを返す", () => {
  const html =
    '<a href="/works/123/episodes/456">第1話</a><a href="/works/123/episodes/789">第2話</a>';
  assertEquals(extractFirstEpisodePath(html, "123"), "/works/123/episodes/456");
});

Deno.test("extractFirstEpisodePath: 該当エピソードが無い場合は null", () => {
  const html = '<a href="/works/999/episodes/1">別作品</a>';
  assertStrictEquals(extractFirstEpisodePath(html, "123"), null);
});

Deno.test("extractWorkMetadata: 対象作品の Work オブジェクトから評価指標を抽出し、先行する別作品は無視する", () => {
  // 作品ページには推薦枠として他作品の Work オブジェクトが先に埋め込まれる。
  // og:url の workId で対象オブジェクトを特定しないとデコイの値を拾う。
  const html = [
    '<meta property="og:title" content="架空のダンジョン物語（テスト著者） - カクヨム" />',
    '<meta property="og:url" content="https://kakuyomu.jp/works/123" />',
    '"Work:999":{"catchphrase":"デコイのコピー","reviewCount":11,"totalReviewPoint":22,"totalCharacterCount":33},',
    '"Work:123":{"catchphrase":"テスト用のキャッチコピー","reviewCount":18830,"totalReviewPoint":42098,"totalCharacterCount":2729564}',
  ].join("");
  assertEquals(extractWorkMetadata(html), {
    title: "架空のダンジョン物語",
    author: "テスト著者",
    catchphrase: "テスト用のキャッチコピー",
    reviewCount: 18830,
    totalReviewPoint: 42098,
    totalCharacterCount: 2729564,
  });
});

Deno.test("extractWorkMetadata: 著者名は og:title 末尾の括弧から取り、タイトルに括弧があっても最後の括弧を著者とする", () => {
  const html = '<meta property="og:title" content="作品（副題）（テスト著者） - カクヨム" />';
  const meta = extractWorkMetadata(html);
  assertEquals(meta.title, "作品（副題）");
  assertEquals(meta.author, "テスト著者");
});

Deno.test("extractWorkMetadata: Work オブジェクトが無ければ評価指標は既定値で補完", () => {
  const html = '<meta property="og:title" content="単独タイトル - カクヨム" />';
  assertEquals(extractWorkMetadata(html), {
    title: "単独タイトル",
    author: "",
    catchphrase: "",
    reviewCount: 0,
    totalReviewPoint: 0,
    totalCharacterCount: 0,
  });
});
