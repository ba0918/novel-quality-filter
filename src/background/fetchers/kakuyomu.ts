import { FETCH_INTERVAL_MS, FETCH_TIMEOUT_MS } from "../../shared/constants.ts";
import { sleep } from "../../shared/async.ts";
import type { LineData } from "../../domain/types.ts";

const KAKUYOMU_BASE = "https://kakuyomu.jp";

export interface FetchedEpisode {
  episodeUrl: string;
  text: string;
  lines: LineData[];
  episodeTitle: string;
  nextEpisodeUrl: string | null;
}

export interface WorkMetadata {
  title: string;
  author: string;
  catchphrase: string;
  reviewCount: number;
  totalReviewPoint: number;
  totalCharacterCount: number;
}

export interface TargetUrl {
  workId: string;
  episodeId: string | null;
}

export async function fetchFirstEpisodeText(workId: string): Promise<FetchedEpisode> {
  const episodePath = await findFirstEpisodeUrl(workId);
  const episodeUrl = resolveEpisodeUrl(episodePath).href;

  // 2回目の fetch 前にインターバルを空ける
  await sleep(FETCH_INTERVAL_MS);

  return fetchEpisode(episodeUrl);
}

export function fetchNextEpisodeText(
  prev: FetchedEpisode,
): Promise<FetchedEpisode | null> {
  if (!prev.nextEpisodeUrl) return Promise.resolve(null);
  const nextUrl = resolveEpisodeUrl(prev.nextEpisodeUrl).href;
  return fetchEpisode(nextUrl);
}

export function resolveEpisodeUrl(href: string): URL {
  const url = new URL(href, KAKUYOMU_BASE);
  if (url.hostname !== "kakuyomu.jp") {
    throw new Error(`Unexpected host: ${url.hostname}`);
  }
  return url;
}

export function parseTargetUrl(href: string): TargetUrl {
  const url = resolveEpisodeUrl(href);
  const match = url.pathname.match(/^\/works\/(\d+)(?:\/episodes\/(\d+))?/);
  if (!match) {
    throw new Error(`Not a kakuyomu work URL: ${href}`);
  }
  return { workId: match[1], episodeId: match[2] ?? null };
}

export function extractFirstEpisodePath(html: string, workId: string): string | null {
  // workId で絞ったエピソードリンクを最優先で探す
  const episodePattern = new RegExp(
    `href=["'](/works/${workId}/episodes/\\d+)["']`,
  );
  const match = html.match(episodePattern);
  if (match) return match[1];

  // フォールバック: 任意の /episodes/ リンク（workId 一致を検証）
  const anyEpisode = /href=["'](\/works\/\d+\/episodes\/\d+)["']/;
  const fallback = html.match(anyEpisode);
  if (fallback && fallback[1].startsWith(`/works/${workId}/`)) {
    return fallback[1];
  }

  return null;
}

async function findFirstEpisodeUrl(workId: string): Promise<string> {
  const workPageUrl = `${KAKUYOMU_BASE}/works/${workId}`;
  const response = await fetch(workPageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Failed to fetch work page: ${response.status} ${workPageUrl}`);
  }

  const html = await response.text();
  const path = extractFirstEpisodePath(html, workId);
  if (path) return path;

  throw new Error(`No episode found for work: ${workId}`);
}

async function fetchEpisode(url: string): Promise<FetchedEpisode> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Failed to fetch episode: ${response.status} ${url}`);
  }

  return buildEpisodeFromHtml(url, await response.text());
}

// 生HTMLから採点/診断に必要な要素を組み立てる純関数。fetch を伴わないため、
// 保存済みHTMLからの再導出（rederive）でも同じ組み立てを再利用できる。
export function buildEpisodeFromHtml(url: string, html: string): FetchedEpisode {
  return {
    episodeUrl: url,
    text: extractTextFromHtml(html),
    lines: extractLinesFromHtml(html),
    episodeTitle: extractEpisodeTitle(html) ?? "",
    nextEpisodeUrl: extractNextEpisodeUrl(html),
  };
}

export interface EpisodeHealth {
  healthy: boolean;
  reason?: string;
}

// 収集経路の門番: 取得応答が「本物の本文ページ」であることを検証する（C5）。
// エラー/年齢確認/bot対策ページを不動の原本として保存すると、後で取り直せない場合に
// データセット全体の信頼性が崩れるため、保存の前段でここを通す。
export function validateEpisodeHtml(status: number, html: string): EpisodeHealth {
  if (status !== 200) return { healthy: false, reason: `http-${status}` };
  if (extractLinesFromHtml(html).length === 0) return { healthy: false, reason: "no-body" };
  let text: string;
  try {
    text = extractTextFromHtml(html);
  } catch {
    return { healthy: false, reason: "no-body" };
  }
  if (text.trim().length === 0) return { healthy: false, reason: "empty-body" };
  return { healthy: true };
}

export function extractEpisodeTitle(html: string): string | null {
  const match = /class="[^"]*widget-episodeTitle[^"]*"[^>]*>\s*([^<]+)/i.exec(html);
  return match ? match[1].trim() : null;
}

export function extractNextEpisodeUrl(html: string): string | null {
  const anchor = /<a\b[^>]*id="contentMain-readNextEpisode"[^>]*>/i.exec(html);
  if (anchor) {
    const href = /href="([^"]+)"/i.exec(anchor[0]);
    if (href) return href[1];
  }

  const relNext = /<link\b[^>]*rel="next"[^>]*>/i.exec(html);
  if (relNext) {
    const href = /href="([^"]+)"/i.exec(relNext[0]);
    if (href) return href[1];
  }

  return null;
}

export function extractWorkMetadata(html: string): WorkMetadata {
  // og:title は「作品名（著者名） - カクヨム」形式。末尾括弧が著者名（タイトル内の
  // 括弧より後ろ）なので、最後の全角括弧をタイトルと著者に分ける
  const ogTitle = matchString(html, /property="og:title"\s+content="([^"]*)"/)
    .replace(/\s*-\s*カクヨム\s*$/, "");
  const authorSplit = ogTitle.match(/^(.*)（([^（）]*)）$/);
  const title = authorSplit ? authorSplit[1] : ogTitle;
  const author = authorSplit ? authorSplit[2] : "";

  // 評価指標は作品ページに埋まった他作品（推薦枠）と混ざるため、
  // og:url の workId で対象の Work オブジェクトへ絞ってから読む
  const workId = matchString(
    html,
    /property="og:url"\s+content="https:\/\/kakuyomu\.jp\/works\/(\d+)"/,
  );
  const workObject = sliceWorkObject(html, workId);

  return {
    title,
    author,
    catchphrase: matchString(workObject, /"catchphrase":"([^"]*)"/),
    reviewCount: matchNumber(workObject, /"reviewCount":(\d+)/),
    totalReviewPoint: matchNumber(workObject, /"totalReviewPoint":(\d+)/),
    totalCharacterCount: matchNumber(workObject, /"totalCharacterCount":(\d+)/),
  };
}

function sliceWorkObject(html: string, workId: string): string {
  if (!workId) return html;
  const start = html.indexOf(`"Work:${workId}":{`);
  if (start === -1) return html;
  // 対象オブジェクトの終端は次の Work 定義の直前（推薦枠は __ref なので定義キーは持たない）
  const nextKeyOffset = html.slice(start + 1).search(/"Work:\d+":\{/);
  return nextKeyOffset === -1 ? html.slice(start) : html.slice(start, start + 1 + nextKeyOffset);
}

function matchString(html: string, pattern: RegExp): string {
  return html.match(pattern)?.[1] ?? "";
}

function matchNumber(html: string, pattern: RegExp): number {
  const raw = html.match(pattern)?.[1];
  return raw ? Number(raw) : 0;
}

// 本文領域を class/id で特定する。既存の flat 抽出と構造化行抽出で共有する。
const BODY_PATTERNS = [
  /class="[^"]*widget-episodeBody[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  /class="[^"]*js-episode-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  /id="episode-body"[^>]*>([\s\S]*?)<\/div>/i,
];

function findBodyRegion(html: string): string | null {
  for (const pattern of BODY_PATTERNS) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function extractTextFromHtml(html: string): string {
  // Service Worker には DOMParser がないため文字列操作で抽出する
  const body = findBodyRegion(html);
  if (body !== null) {
    return stripHtmlTags(normalizeBodyHtml(body));
  }

  // フォールバック: <p> タグの内容を抽出
  const paragraphs: string[] = [];
  const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pPattern.exec(html)) !== null) {
    const text = stripHtmlTags(pMatch[1]).trim();
    if (text.length > 0) paragraphs.push(text);
  }

  if (paragraphs.length > 10) {
    return paragraphs.join("\n");
  }

  throw new Error(`Could not extract episode text from: ${html.slice(0, 120)}`);
}

// 行メタデータ用の構造化抽出。本文領域内の <p> を1行として走査し、blank クラスを空行として
// 保持する（連続空行の圧縮や空行の破棄はしない）。ルビは除去し base だけを残す。既存 flat 抽出
// とは別経路で、12指標のスコア計算には影響しない。本文領域が無ければ空配列を返す（診断は採点を
// 止めない）。
export function extractLinesFromHtml(html: string): LineData[] {
  const body = findBodyRegion(html);
  if (body === null) return [];

  const lines: LineData[] = [];
  const pPattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pPattern.exec(body)) !== null) {
    const isBlank = /class="[^"]*\bblank\b[^"]*"/i.test(match[1]);
    lines.push({ text: isBlank ? "" : stripLineTags(match[2]), isBlank });
  }
  return lines;
}

function stripLineTags(inner: string): string {
  return decodeHtmlEntities(
    stripRubyAnnotations(inner)
      .replace(/<br\s*\/?>/gi, "")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

function normalizeBodyHtml(html: string): string {
  return html.replace(/>[ \t\r\n]+</g, "><");
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(
    stripRubyAnnotations(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(s: string): string {
  // 数値参照は名前付き実体より先に、かつ &amp; 復号より前に処理する。&amp;#65; のような
  // 二重エスケープを A へ誤って一段余計に復号しないため（数値正規表現は &# 実体を要求する）。
  return s
    .replace(/&#x([0-9a-fA-F]+);/gi, (m, hex) => decodeCodePoint(parseInt(hex, 16)) ?? m)
    .replace(/&#(\d+);/g, (m, dec) => decodeCodePoint(parseInt(dec, 10)) ?? m)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

// 範囲外・サロゲート領域・不正なコードポイントは復号せず呼び出し元で元の実体表記を残す
// （安全側に倒す）。単独サロゲート U+D800..U+DFFF は String.fromCodePoint が throw せず
// lone surrogate を返してしまうため、ここで明示的に弾く。
function decodeCodePoint(code: number): string | null {
  if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF) return null;
  if (code >= 0xD800 && code <= 0xDFFF) return null;
  return String.fromCodePoint(code);
}

function stripRubyAnnotations(html: string): string {
  return html
    .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, "")
    .replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, "");
}
