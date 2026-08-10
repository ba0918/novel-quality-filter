// ScoreResult（＋作品メタ）を1作品ぶんの静的 HTML カードへ描く。DOM 版（work-page-injector）と
// 表示ロジック（dossier_format）を共有し、本番拡張の詳細カードと同じ体裁を HTML 文字列で再現する。
// 本文由来文字列（タイトル・作者）は escapeHtml で必ず包み、XSS・タグ崩れを防ぐ。

import type {
  LineMetadata,
  MetricResult,
  PenaltyResult,
  ScoreResult,
} from "../../src/domain/types.ts";
import { formatOpeningContext } from "../../src/domain/analyzer/opening_format.ts";
import {
  averageCharsLabel,
  averagePerLineLabel,
  compositionSegments,
  escapeHtml,
  formatInt,
  formatRawValue,
  isNarrativeCount,
  percentInt,
  percentOne,
  widthPercent,
} from "../../src/domain/analyzer/dossier_format.ts";

export interface DossierMeta {
  title: string;
  author: string;
  url: string;
  reviewCount: number;
  totalReviewPoint: number;
  totalCharacterCount: number;
}

export function renderDossierCard(meta: DossierMeta, result: ScoreResult): string {
  return [
    `<div class="nqf-card">`,
    renderCardHeader(meta, result),
    `<div class="nqf-detail-context">${escapeHtml(context(result))}</div>`,
    renderMetrics(result.metrics),
    renderPenalties(result.penalties),
    result.lineMetadata ? renderLineMetadata(result.lineMetadata) : "",
    `</div>`,
  ].join("\n");
}

function context(result: ScoreResult): string {
  return formatOpeningContext(
    result.openingType,
    result.sampledCount,
    result.targetEpisodeIndex ?? 0,
  );
}

function renderCardHeader(meta: DossierMeta, result: ScoreResult): string {
  return [
    `<div class="nqf-card-head">`,
    `<a class="nqf-card-title" href="${escapeHtml(meta.url)}">${escapeHtml(meta.title)}</a>`,
    `<span class="nqf-card-author">${escapeHtml(meta.author)}</span>`,
    `<span class="nqf-card-score">${result.score}</span>`,
    `</div>`,
    `<div class="nqf-card-meta">`,
    `レビュー ${formatInt(meta.reviewCount)} / 評価pt ${
      formatInt(meta.totalReviewPoint)
    } / 総文字 ${formatInt(meta.totalCharacterCount)}`,
    `</div>`,
  ].join("\n");
}

function renderMetrics(metrics: MetricResult[]): string {
  const rows = metrics.map((m) => {
    const flag = m.flagged ? " nqf-metric-row--flagged" : "";
    const norm = Math.round(m.normalizedValue * 100);
    return [
      `<div class="nqf-metric-row${flag}">`,
      `<span class="nqf-metric-label">${escapeHtml(m.label)}</span>`,
      `<span class="nqf-metric-raw">${formatRawValue(m.rawValue)}</span>`,
      `<span class="nqf-metric-bar-container"><span class="nqf-metric-bar" style="width:${norm}%"></span></span>`,
      `<span class="nqf-metric-norm">${norm}%</span>`,
      `</div>`,
    ].join("");
  });
  return `<div class="nqf-detail-metrics"><div class="nqf-detail-section-title">指標</div>${
    rows.join("\n")
  }</div>`;
}

function renderPenalties(penalties: PenaltyResult[]): string {
  const title =
    `<div class="nqf-detail-section-title nqf-detail-section-title--penalty">ペナルティ</div>`;
  if (penalties.length === 0) {
    return `<div class="nqf-detail-penalties">${title}<div class="nqf-penalty-none">なし</div></div>`;
  }
  const rows = penalties.map((p) =>
    `<div class="nqf-penalty-row"><span class="nqf-penalty-label">${
      escapeHtml(p.label)
    }</span><span class="nqf-penalty-multiplier">x${p.multiplier}</span></div>`
  );
  return `<div class="nqf-detail-penalties">${title}${rows.join("\n")}</div>`;
}

function renderLineMetadata(meta: LineMetadata): string {
  const compo = compositionSegments(meta).map(([slug, count]) =>
    `<span class="nqf-lm-seg nqf-lm-seg--${slug}" style="width:${
      widthPercent(count, meta.totalLines).toFixed(2)
    }%"></span>`
  ).join("");

  const cats = catViews(meta).map((c) => renderCatBlock(c, meta)).join("\n");

  return [
    `<div class="nqf-line-metadata">`,
    `<div class="nqf-lm-headline">`,
    `<span class="nqf-lm-chip">平均 ${averagePerLineLabel(meta)}</span>`,
    `<span class="nqf-lm-chip nqf-lm-chip--concern">地の文 短行30 ${
      percentInt(meta.narrative.short30, meta.narrative.lineCount)
    }</span>`,
    `</div>`,
    `<div class="nqf-lm-summary">総行数 ${formatInt(meta.totalLines)} / 総文字数 ${
      formatInt(meta.totalChars)
    } / 空行 ${percentInt(meta.blankCount, meta.totalLines)} / 区切り線 ${
      percentInt(meta.separatorCount, meta.totalLines)
    }</div>`,
    `<div class="nqf-lm-compo" role="img" aria-label="行の構成比">${compo}</div>`,
    cats,
    `</div>`,
  ].join("\n");
}

interface CatView {
  label: string;
  slug: string;
  count: LineMetadata["narrative"] | LineMetadata["dialogue"];
}

function catViews(meta: LineMetadata): CatView[] {
  return [
    { label: "地の文", slug: "narrative", count: meta.narrative },
    { label: "セリフ", slug: "dialogue", count: meta.dialogue },
    { label: "メタ", slug: "meta", count: meta.meta },
    { label: "非文末", slug: "nonterm", count: meta.nonTerminal },
  ];
}

function renderCatBlock(cat: CatView, meta: LineMetadata): string {
  const c = cat.count;
  const chunkNote = isNarrativeCount(c) ? ` / チャンク ${formatInt(c.chunkCount)}` : "";
  return [
    `<div class="nqf-lm-cat">`,
    `<div class="nqf-lm-cat-head"><span class="nqf-lm-cat-name">${cat.label}</span>`,
    `<span class="nqf-lm-cat-sub">平均 ${averageCharsLabel(c)}${chunkNote}</span></div>`,
    `<div class="nqf-lm-cat-body">行 ${formatInt(c.lineCount)}（${
      percentOne(c.lineCount, meta.totalLines)
    }） / 文字 ${formatInt(c.charCount)}（${percentOne(c.charCount, meta.totalChars)}） / 短行 20:${
      percentInt(c.short20, c.lineCount)
    } 30:${percentInt(c.short30, c.lineCount)}</div>`,
    `</div>`,
  ].join("\n");
}

const PAGE_STYLE = `
  body { font-family: system-ui, sans-serif; margin: 1.5rem; background: #12141a; color: #e4e6eb; }
  a { color: #7cc0ff; }
  .nqf-card { border: 1px solid #2a2f3a; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .nqf-card-head { display: flex; gap: .75rem; align-items: baseline; }
  .nqf-card-title { font-weight: 600; font-size: 1.1rem; }
  .nqf-card-author { color: #9aa0aa; font-size: .85rem; }
  .nqf-card-score { margin-left: auto; font-size: 1.3rem; font-weight: 700; }
  .nqf-card-meta { color: #9aa0aa; font-size: .8rem; margin: .25rem 0 .75rem; }
  .nqf-detail-section-title { font-weight: 600; margin: .5rem 0 .25rem; }
  .nqf-metric-row { display: flex; gap: .5rem; align-items: center; font-size: .85rem; padding: 1px 0; }
  .nqf-metric-row--flagged { color: #ff9a8a; }
  .nqf-metric-label { width: 12rem; }
  .nqf-metric-raw { width: 4rem; text-align: right; }
  .nqf-metric-bar-container { flex: 1; height: 8px; background: #222733; border-radius: 4px; overflow: hidden; }
  .nqf-metric-bar { display: block; height: 100%; background: #4a90d9; }
  .nqf-metric-norm { width: 3rem; text-align: right; }
  .nqf-penalty-row { display: flex; gap: .5rem; font-size: .85rem; color: #ffc27a; }
  .nqf-lm-compo { display: flex; height: 10px; border-radius: 4px; overflow: hidden; margin: .25rem 0; }
  .nqf-lm-seg { display: block; height: 100%; }
  .nqf-lm-seg--narrative { background: #4a90d9; } .nqf-lm-seg--dialogue { background: #67c680; }
  .nqf-lm-seg--meta { background: #d98cd9; } .nqf-lm-seg--nonterm { background: #d9b34a; }
  .nqf-lm-seg--blank { background: #3a3f4a; } .nqf-lm-seg--sep { background: #6a6f7a; }
  .nqf-lm-chip { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #222733; margin-right: .35rem; font-size: .8rem; }
  .nqf-lm-chip--concern { background: #4a2a2a; color: #ff9a8a; }
  .nqf-lm-summary, .nqf-lm-cat-body { color: #9aa0aa; font-size: .8rem; }
  .nqf-cmp { border-collapse: collapse; width: 100%; font-size: .9rem; }
  .nqf-cmp th, .nqf-cmp td { border: 1px solid #2a2f3a; padding: .35rem .5rem; text-align: right; }
  .nqf-cmp th:first-child, .nqf-cmp td:first-child { text-align: left; }
  .nqf-up { color: #67c680; } .nqf-down { color: #ff9a8a; }
`;

export function renderHtmlPage(title: string, body: string): string {
  return [
    "<!DOCTYPE html>",
    `<html lang="ja"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(title)}</title>`,
    `<style>${PAGE_STYLE}</style>`,
    `</head><body>`,
    body,
    `</body></html>`,
  ].join("\n");
}
