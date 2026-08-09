import { FETCH_INTERVAL_MS, FETCH_TIMEOUT_MS } from "../../shared/constants.ts";
import { sleep } from "../../shared/async.ts";

const KAKUYOMU_BASE = "https://kakuyomu.jp";

export interface FetchedEpisode {
  episodeUrl: string;
  text: string;
  episodeTitle: string;
  nextEpisodeUrl: string | null;
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

async function findFirstEpisodeUrl(workId: string): Promise<string> {
  const workPageUrl = `${KAKUYOMU_BASE}/works/${workId}`;
  const response = await fetch(workPageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Failed to fetch work page: ${response.status} ${workPageUrl}`);
  }

  const html = await response.text();

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

  throw new Error(`No episode found for work: ${workId}`);
}

async function fetchEpisode(url: string): Promise<FetchedEpisode> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Failed to fetch episode: ${response.status} ${url}`);
  }

  const html = await response.text();
  return {
    episodeUrl: url,
    text: extractTextFromHtml(html),
    episodeTitle: extractEpisodeTitle(html) ?? "",
    nextEpisodeUrl: extractNextEpisodeUrl(html),
  };
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

export function extractTextFromHtml(html: string): string {
  // Service Worker には DOMParser がないため文字列操作で抽出する

  // 本文領域を class/id で特定
  const bodyPatterns = [
    /class="[^"]*widget-episodeBody[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /class="[^"]*js-episode-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /id="episode-body"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of bodyPatterns) {
    const match = html.match(pattern);
    if (match) {
      return stripHtmlTags(match[1]);
    }
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

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
