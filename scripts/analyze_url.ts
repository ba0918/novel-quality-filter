// カクヨム作品を URL 一本でメタデータ取得＋スコアリングする較正用ツール。
// Usage: deno task analyze <url...> [--csv]
//   url  : 作品 or エピソードの URL（複数可。どの話 URL でも作品の第1話から評価する）
//   --csv: 集計用に CSV を末尾へ出力する
//
// 採点対象話は本番拡張と同じ sampleEpisodes（開幕形式判定＋再採点）で決める。
// これを通さず第1話を生採点するとキャラ紹介/掲示板開幕でブラウザ表示と食い違う。
//
// 「現状スコア」と「候補(複合)スコア」を並べて出す。候補は一文一段落ペナルティを
// 「一文段落が多い AND 文長のばらつきが小さい」の複合条件でのみ発火させる案の評価用。

import { FETCH_INTERVAL_MS, FETCH_TIMEOUT_MS } from "../src/shared/constants.ts";
import { sleep } from "../src/shared/async.ts";
import {
  extractEpisodeTitle,
  extractFirstEpisodePath,
  extractNextEpisodeUrl,
  extractTextFromHtml,
  extractWorkMetadata,
  type FetchedEpisode,
  parseTargetUrl,
  resolveEpisodeUrl,
  type WorkMetadata,
} from "../src/background/fetchers/kakuyomu.ts";
import { sampleEpisodes } from "../src/background/sampling.ts";
import { initTokenizer, tokenize } from "../src/domain/tokenizer/mod.ts";
import { analyzeAll } from "../src/domain/analyzer/mod.ts";
import { analyzeBlankLineRatio } from "../src/domain/analyzer/blank_line.ts";
import { calculateScore } from "../src/domain/scoring/mod.ts";
import type { MetricResult, OpeningFormat } from "../src/domain/types.ts";

const THRESHOLD = 40;

interface Row {
  meta: WorkMetadata;
  firstEpisodeTitle: string;
  openingType: OpeningFormat;
  sampledCount: number;
  episodeUrl: string;
  current: number;
  candidate: number;
  singleSentParaRatio: number;
  sentenceLengthSD: number;
  burstiness: number;
  blankLineRatio: number; // 観測専用（スコア非算入）
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "Mozilla/5.0 (compatible; novel-quality-filter/analyze)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${res.status}: ${url}`);
  return res.text();
}

function normOf(metrics: MetricResult[], key: string): number {
  return metrics.find((m) => m.key === key)?.normalizedValue ?? 0;
}

function rawOf(metrics: MetricResult[], key: string): number {
  return metrics.find((m) => m.key === key)?.rawValue ?? 0;
}

// 候補ペナルティ: 既存「文長の緩急・ばらつき不足」は据え置き、
// 「一文一段落の過多」だけ文長SDとの複合条件へ差し替えて再計算する。
function candidateScore(metrics: MetricResult[]): number {
  const base = Math.max(0, Math.min(100, metrics.reduce((s, m) => s + m.contribution, 0)));
  let mult = 1;
  if (
    rawOf(metrics, "sentenceLengthBurstiness") !== 0 &&
    normOf(metrics, "sentenceLengthBurstiness") < 0.5 &&
    normOf(metrics, "sentenceLengthSD") < 0.45
  ) mult *= 0.55;
  if (normOf(metrics, "singleSentParaRatio") < 0.30 && normOf(metrics, "sentenceLengthSD") < 0.60) {
    mult *= 0.65;
  }
  return Math.round(base * mult);
}

async function fetchEpisode(episodeUrl: string): Promise<FetchedEpisode> {
  const html = await fetchText(episodeUrl);
  return {
    episodeUrl,
    text: extractTextFromHtml(html),
    episodeTitle: extractEpisodeTitle(html) ?? "",
    nextEpisodeUrl: extractNextEpisodeUrl(html),
  };
}

async function analyzeUrl(url: string): Promise<Row> {
  // どの話 URL でも作品を識別するだけに使い、採点は本番と同じく第1話から始める。
  const { workId } = parseTargetUrl(url);

  const workHtml = await fetchText(`https://kakuyomu.jp/works/${workId}`);
  const meta = extractWorkMetadata(workHtml);

  const firstPath = extractFirstEpisodePath(workHtml, workId);
  if (!firstPath) throw new Error(`No episode found for work: ${workId}`);

  await sleep(FETCH_INTERVAL_MS);
  const first = await fetchEpisode(resolveEpisodeUrl(firstPath).href);

  const sampling = await sampleEpisodes(first, async (prev) => {
    if (!prev.nextEpisodeUrl) return null;
    await sleep(FETCH_INTERVAL_MS);
    return fetchEpisode(resolveEpisodeUrl(prev.nextEpisodeUrl).href);
  });

  const tokens = tokenize(sampling.targetText);
  const { score, metrics } = calculateScore(
    analyzeAll(sampling.targetText, tokens, tokenize),
  );

  return {
    meta,
    firstEpisodeTitle: first.episodeTitle,
    openingType: sampling.openingType,
    sampledCount: sampling.sampledCount,
    episodeUrl: sampling.episodeUrl,
    current: score,
    candidate: candidateScore(metrics),
    singleSentParaRatio: rawOf(metrics, "singleSentParaRatio"),
    sentenceLengthSD: rawOf(metrics, "sentenceLengthSD"),
    burstiness: rawOf(metrics, "sentenceLengthBurstiness"),
    blankLineRatio: analyzeBlankLineRatio(sampling.targetText),
  };
}

function verdict(score: number): string {
  return score > THRESHOLD ? "⭕通過" : "❌除外";
}

function printDetail(row: Row): void {
  const m = row.meta;
  console.log(`\n■ ${m.title}${m.author ? `（${m.author}）` : ""}`);
  console.log(
    `  レビュー ${m.reviewCount} / 評価pt ${m.totalReviewPoint} / 総文字 ${m.totalCharacterCount}`,
  );
  console.log(`  第1話「${row.firstEpisodeTitle}」`);
  console.log(
    `  開幕形式 ${row.openingType}（${row.sampledCount}話サンプル）→ 採点話 ${row.episodeUrl}`,
  );
  console.log(
    `  スコア: 現状 ${row.current} ${verdict(row.current)}  /  候補(複合) ${row.candidate} ${
      verdict(row.candidate)
    }`,
  );
  console.log(
    `  指標: 一文段落率 ${row.singleSentParaRatio.toFixed(3)} / 文長SD ${
      row.sentenceLengthSD.toFixed(1)
    } / バースティ ${row.burstiness.toFixed(1)} / 空行率 ${
      row.blankLineRatio.toFixed(3)
    }（観測のみ）`,
  );
}

function printTable(rows: Row[]): void {
  console.log(`\n=== 比較テーブル（閾値 ${THRESHOLD}）===`);
  console.log(
    "タイトル                       レビュー   現状   候補  一文段落率  文長SD  空行率  開幕形式",
  );
  for (const r of rows) {
    const title = r.meta.title.length > 28 ? r.meta.title.slice(0, 27) + "…" : r.meta.title;
    console.log(
      `${title.padEnd(30)} ${String(r.meta.reviewCount).padStart(7)} ${
        String(r.current).padStart(5)
      } ${String(r.candidate).padStart(5)} ${r.singleSentParaRatio.toFixed(3).padStart(9)} ${
        r.sentenceLengthSD.toFixed(1).padStart(7)
      } ${r.blankLineRatio.toFixed(3).padStart(6)}  ${r.openingType}`,
    );
  }
}

function printCsv(rows: Row[]): void {
  console.log("\n=== CSV ===");
  console.log(
    "title,author,reviewCount,totalReviewPoint,totalCharacterCount,openingType,sampledCount,current,candidate,singleSentParaRatio,sentenceLengthSD,burstiness,blankLineRatio,episodeUrl",
  );
  for (const r of rows) {
    const m = r.meta;
    const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
    console.log([
      cell(m.title),
      cell(m.author),
      m.reviewCount,
      m.totalReviewPoint,
      m.totalCharacterCount,
      r.openingType,
      r.sampledCount,
      r.current,
      r.candidate,
      r.singleSentParaRatio.toFixed(4),
      r.sentenceLengthSD.toFixed(4),
      r.burstiness.toFixed(4),
      r.blankLineRatio.toFixed(4),
      cell(r.episodeUrl),
    ].join(","));
  }
}

async function main(): Promise<void> {
  const args = Deno.args.filter((a) => a !== "--csv");
  const csv = Deno.args.includes("--csv");
  if (args.length === 0) {
    console.error("Usage: deno task analyze <url...> [--csv]");
    Deno.exit(1);
  }

  await initTokenizer();

  const rows: Row[] = [];
  for (const [i, url] of args.entries()) {
    if (i > 0) await sleep(FETCH_INTERVAL_MS);
    try {
      const row = await analyzeUrl(url);
      printDetail(row);
      rows.push(row);
    } catch (e) {
      console.error(`\n✗ ${url}\n  ${e instanceof Error ? e.message : e}`);
    }
  }

  if (rows.length > 1) printTable(rows);
  if (csv) printCsv(rows);
}

await main();
