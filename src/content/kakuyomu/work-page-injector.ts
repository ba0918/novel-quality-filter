import type {
  CategoryCount,
  LineMetadata,
  MetricResult,
  PenaltyResult,
  ScoreResult,
} from "../../domain/types.ts";
import { formatOpeningContext } from "../../domain/analyzer/opening_format.ts";
import {
  averageCharsLabel,
  averagePerLineLabel,
  compositionSegments,
  formatInt,
  formatRawValue,
  isNarrativeCount,
  percentInt,
  percentOne,
  widthPercent,
} from "../../domain/analyzer/dossier_format.ts";
import { scoreToColor } from "./score-color.ts";

const BADGE_CLASS = "nqf-work-badge";
const PANEL_CLASS = "nqf-detail-panel";
const PROCESSED_ATTR = "data-nqf-work-processed";

export function injectScoreButton(
  container: HTMLElement,
  onScore: () => void,
): void {
  removeExisting(container);

  const button = document.createElement("button");
  button.className = "nqf-score-button";
  button.textContent = "NQF スコアリング";
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    button.disabled = true;
    button.textContent = "...";
    button.classList.add("nqf-score-button--loading");
    onScore();
  });

  insertElement(container, button);
}

export function injectWorkBadge(
  container: HTMLElement,
  result: ScoreResult,
  onRescore: () => void,
): void {
  removeExisting(container);
  container.setAttribute(PROCESSED_ATTR, "true");

  const badge = createWorkBadge(result.score);
  const panel = createDetailPanel(result);
  panel.style.display = "none";

  let panelOpen = false;

  badge.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? "block" : "none";
    badge.classList.toggle("nqf-work-badge--open", panelOpen);
  });

  const rescoreBtn = panel.querySelector<HTMLButtonElement>(".nqf-rescore-button");
  if (rescoreBtn) {
    rescoreBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      rescoreBtn.disabled = true;
      rescoreBtn.textContent = "再スコアリング中...";
      onRescore();
    });
  }

  const wrapper = document.createElement("span");
  wrapper.className = "nqf-work-wrapper";
  wrapper.appendChild(badge);
  wrapper.appendChild(panel);

  insertElement(container, wrapper);
}

export function injectWorkLoading(container: HTMLElement): void {
  removeExisting(container);
  container.setAttribute(PROCESSED_ATTR, "true");

  const badge = document.createElement("span");
  badge.className = `${BADGE_CLASS} nqf-badge--loading`;
  badge.textContent = "...";
  insertElement(container, badge);
}

export function injectWorkError(container: HTMLElement, onRetry: () => void): void {
  removeExisting(container);

  const badge = document.createElement("span");
  badge.className = `${BADGE_CLASS}`;
  badge.style.backgroundColor = "#666";
  badge.textContent = "!";
  badge.title = "スコアリング失敗（クリックで再試行）";
  badge.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRetry();
  });
  insertElement(container, badge);
}

function removeExisting(container: HTMLElement): void {
  container.querySelector(".nqf-work-wrapper")?.remove();
  container.querySelector(`.${BADGE_CLASS}`)?.remove();
  container.querySelector(`.${PANEL_CLASS}`)?.remove();
  container.querySelector(".nqf-score-button")?.remove();
}

function insertElement(container: HTMLElement, element: HTMLElement): void {
  // 未スコア/スコア済み/ローディング/エラーのどの状態でも、作品ヘッダー行（flex 行）の
  // 右端に揃える。各状態で注入要素が異なるため、揃えは注入層で一律に指定する。
  element.style.marginLeft = "auto";
  container.appendChild(element);
}

function createWorkBadge(score: number): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = BADGE_CLASS;
  badge.textContent = `${score} ▼`;
  badge.style.backgroundColor = scoreToColor(score);
  return badge;
}

function createDetailPanel(result: ScoreResult): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = PANEL_CLASS;

  // スコアヘッダー
  const header = document.createElement("div");
  header.className = "nqf-detail-header";
  const scoreLabel = document.createElement("span");
  scoreLabel.className = "nqf-detail-score-label";
  scoreLabel.textContent = "NQF スコア";
  const scoreValue = document.createElement("span");
  scoreValue.className = "nqf-detail-score-value";
  scoreValue.textContent = String(result.score);
  scoreValue.style.color = scoreToColor(result.score);
  header.appendChild(scoreLabel);
  header.appendChild(scoreValue);
  panel.appendChild(header);

  // 開幕形式・再評価文脈
  const context = document.createElement("div");
  context.className = "nqf-detail-context";
  context.textContent = formatOpeningContext(
    result.openingType,
    result.sampledCount,
    result.targetEpisodeIndex ?? 0,
  );
  panel.appendChild(context);

  // メトリクス一覧
  const metricsSection = document.createElement("div");
  metricsSection.className = "nqf-detail-metrics";

  const metricsTitle = document.createElement("div");
  metricsTitle.className = "nqf-detail-section-title";
  metricsTitle.textContent = "指標";
  metricsSection.appendChild(metricsTitle);

  for (const m of result.metrics) {
    metricsSection.appendChild(createMetricRow(m));
  }
  panel.appendChild(metricsSection);

  // ペナルティセクション
  const penaltySection = createPenaltySection(result.penalties);
  panel.appendChild(penaltySection);

  // 行メタデータセクション（診断用・総合スコアには寄与しない）
  if (result.lineMetadata) {
    panel.appendChild(createLineMetadataSection(result.lineMetadata));
  }

  // 再スコアボタン
  const rescoreBtn = document.createElement("button");
  rescoreBtn.className = "nqf-rescore-button";
  rescoreBtn.textContent = "再スコアリング";
  panel.appendChild(rescoreBtn);

  return panel;
}

function createMetricRow(m: MetricResult): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "nqf-metric-row";
  if (m.flagged) row.classList.add("nqf-metric-row--flagged");

  const label = document.createElement("span");
  label.className = "nqf-metric-label";
  label.textContent = m.label;
  row.appendChild(label);

  const rawVal = document.createElement("span");
  rawVal.className = "nqf-metric-raw";
  rawVal.textContent = formatRawValue(m.rawValue);
  row.appendChild(rawVal);

  const barContainer = document.createElement("span");
  barContainer.className = "nqf-metric-bar-container";
  const bar = document.createElement("span");
  bar.className = "nqf-metric-bar";
  bar.style.width = `${Math.round(m.normalizedValue * 100)}%`;
  if (m.flagged) bar.classList.add("nqf-metric-bar--flagged");
  barContainer.appendChild(bar);
  row.appendChild(barContainer);

  const normVal = document.createElement("span");
  normVal.className = "nqf-metric-norm";
  normVal.textContent = `${Math.round(m.normalizedValue * 100)}%`;
  row.appendChild(normVal);

  return row;
}

function createPenaltySection(penalties: PenaltyResult[]): HTMLDivElement {
  const section = document.createElement("div");
  section.className = "nqf-detail-penalties";

  const title = document.createElement("div");
  title.className = "nqf-detail-section-title nqf-detail-section-title--penalty";
  title.textContent = "ペナルティ";
  section.appendChild(title);

  if (penalties.length === 0) {
    const none = document.createElement("div");
    none.className = "nqf-penalty-none";
    none.textContent = "なし";
    section.appendChild(none);
    return section;
  }

  for (const p of penalties) {
    const row = document.createElement("div");
    row.className = "nqf-penalty-row";

    const label = document.createElement("span");
    label.className = "nqf-penalty-label";
    label.textContent = p.label;
    row.appendChild(label);

    const multiplier = document.createElement("span");
    multiplier.className = "nqf-penalty-multiplier";
    multiplier.textContent = `x${p.multiplier}`;
    row.appendChild(multiplier);

    section.appendChild(row);
  }

  return section;
}

// 行ベース文体メタデータ（診断用）。既存メトリクスとは別枠で、開閉式セクションとして
// カテゴリ別の分量・短行率・1行あたり平均文字数を表示する。総合スコアには寄与しない。
// 本文由来テキストは含まないため textContent で安全に組み立てる。カテゴリ色は modifier
// クラス（styles.ts）へ寄せ、動的なバー幅だけを inline style で与える。
interface CategoryView {
  label: string;
  slug: string;
  count: CategoryCount;
}

function createLineMetadataSection(meta: LineMetadata): HTMLDivElement {
  const section = document.createElement("div");
  section.className = "nqf-line-metadata";

  const avgLabel = averagePerLineLabel(meta);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "nqf-lm-toggle";
  toggle.setAttribute("aria-expanded", "false");

  const caret = document.createElement("span");
  caret.className = "nqf-lm-caret";
  caret.textContent = "▼";
  toggle.appendChild(caret);
  toggle.appendChild(document.createTextNode("行メタデータ"));

  const peek = document.createElement("span");
  peek.className = "nqf-lm-peek";
  peek.textContent = `平均 ${avgLabel} ・ 空行 ${percentInt(meta.blankCount, meta.totalLines)}`;
  toggle.appendChild(peek);
  section.appendChild(toggle);

  const body = document.createElement("div");
  body.className = "nqf-lm-body";
  body.setAttribute("hidden", "");
  section.appendChild(body);

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    if (expanded) body.setAttribute("hidden", "");
    else body.removeAttribute("hidden");
  });

  body.appendChild(createLineSummary(meta));
  body.appendChild(createLineHeadline(meta, avgLabel));
  body.appendChild(createCompositionBar(meta));
  body.appendChild(createCompositionLegend(meta));

  const cats: CategoryView[] = [
    { label: "地の文", slug: "narrative", count: meta.narrative },
    { label: "セリフ", slug: "dialogue", count: meta.dialogue },
    { label: "メタ", slug: "meta", count: meta.meta },
    { label: "非文末", slug: "nonterm", count: meta.nonTerminal },
  ];
  for (const cat of cats) {
    body.appendChild(createLineCatBlock(cat, meta));
  }

  return section;
}

function createLineSummary(meta: LineMetadata): HTMLDivElement {
  const summary = document.createElement("div");
  summary.className = "nqf-lm-summary";
  summary.appendChild(summaryItem("総行数 ", formatInt(meta.totalLines)));
  summary.appendChild(summaryItem("総文字数 ", formatInt(meta.totalChars)));
  summary.appendChild(summaryRateItem("空行 ", meta.blankCount, meta.totalLines));
  summary.appendChild(summaryRateItem("区切り線 ", meta.separatorCount, meta.totalLines));
  return summary;
}

function summaryItem(label: string, value: string): HTMLSpanElement {
  const item = document.createElement("span");
  item.appendChild(document.createTextNode(label));
  const num = document.createElement("span");
  num.className = "nqf-lm-num";
  num.textContent = value;
  item.appendChild(num);
  return item;
}

function summaryRateItem(label: string, count: number, total: number): HTMLSpanElement {
  const item = summaryItem(label, formatInt(count));
  item.appendChild(document.createTextNode(" "));
  const rate = document.createElement("span");
  rate.className = "nqf-lm-rate";
  rate.textContent = `（${percentInt(count, total)}）`;
  item.appendChild(rate);
  return item;
}

// 「薄さ」の見出しスカラー。平均字/行（全体密度）と地の文短行30率（判別力のある軸）の2枚。
// 全カテゴリを混ぜた総合短行率は判別力を失うため出さない。
function createLineHeadline(meta: LineMetadata, avgLabel: string): HTMLDivElement {
  const headline = document.createElement("div");
  headline.className = "nqf-lm-headline";
  headline.appendChild(chip("平均", avgLabel, false));
  headline.appendChild(
    chip("地の文 短行30", percentInt(meta.narrative.short30, meta.narrative.lineCount), true),
  );
  return headline;
}

function chip(label: string, value: string, concern: boolean): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = concern ? "nqf-lm-chip nqf-lm-chip--concern" : "nqf-lm-chip";
  const lab = document.createElement("span");
  lab.className = "nqf-lm-chip-lab";
  lab.textContent = label;
  el.appendChild(lab);
  const num = document.createElement("span");
  num.className = "nqf-lm-chip-num";
  num.textContent = value;
  el.appendChild(num);
  return el;
}

function createCompositionBar(meta: LineMetadata): HTMLDivElement {
  const bar = document.createElement("div");
  bar.className = "nqf-lm-compo";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", "行の構成比");
  for (const [slug, count] of compositionSegments(meta)) {
    const seg = document.createElement("span");
    seg.className = `nqf-lm-seg nqf-lm-seg--${slug}`;
    seg.style.width = `${widthPercent(count, meta.totalLines).toFixed(2)}%`;
    bar.appendChild(seg);
  }
  return bar;
}

function createCompositionLegend(meta: LineMetadata): HTMLDivElement {
  const legend = document.createElement("div");
  legend.className = "nqf-lm-legend";
  const entries: Array<[string, string, number]> = [
    ["地の文", "narrative", meta.narrative.lineCount],
    ["セリフ", "dialogue", meta.dialogue.lineCount],
    ["メタ", "meta", meta.meta.lineCount],
    ["非文末", "nonterm", meta.nonTerminal.lineCount],
    ["空行", "blank", meta.blankCount],
    ["区切り", "sep", meta.separatorCount],
  ];
  for (const [label, slug, count] of entries) {
    const item = document.createElement("span");
    const swatch = document.createElement("i");
    swatch.className = `nqf-lm-swatch nqf-lm-swatch--${slug}`;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(`${label} `));
    const num = document.createElement("span");
    num.className = "nqf-lm-num";
    num.textContent = percentInt(count, meta.totalLines);
    item.appendChild(num);
    legend.appendChild(item);
  }
  return legend;
}

function createLineCatBlock(cat: CategoryView, meta: LineMetadata): HTMLDivElement {
  const block = document.createElement("div");
  block.className = "nqf-lm-cat";

  const head = document.createElement("div");
  head.className = "nqf-lm-cat-head";
  const dot = document.createElement("span");
  dot.className = `nqf-lm-cat-dot nqf-lm-swatch--${cat.slug}`;
  head.appendChild(dot);
  const name = document.createElement("span");
  name.className = "nqf-lm-cat-name";
  name.textContent = cat.label;
  head.appendChild(name);
  const sub = document.createElement("span");
  sub.className = "nqf-lm-cat-sub";
  sub.textContent = isNarrativeCount(cat.count)
    ? `平均 ${averageCharsLabel(cat.count)} / チャンク ${formatInt(cat.count.chunkCount)}`
    : `平均 ${averageCharsLabel(cat.count)}`;
  head.appendChild(sub);
  block.appendChild(head);

  block.appendChild(
    amountMetricRow("lines", "行", cat.slug, cat.count.lineCount, meta.totalLines),
  );
  block.appendChild(
    amountMetricRow("chars", "文字", cat.slug, cat.count.charCount, meta.totalChars),
  );
  block.appendChild(
    shortMetricRow(
      "short",
      "短行",
      cat.count.short14,
      cat.count.short20,
      cat.count.lineCount,
    ),
  );
  if (isNarrativeCount(cat.count)) {
    block.appendChild(
      shortMetricRow(
        "shortchunk",
        "短ﾁｬﾝｸ",
        cat.count.shortChunk14,
        cat.count.shortChunk20,
        cat.count.chunkCount,
      ),
    );
  }
  return block;
}

// 行割合・文字割合。バーはカテゴリ色、値は「生数（割合）」で示す。
function amountMetricRow(
  kind: string,
  key: string,
  slug: string,
  value: number,
  total: number,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `nqf-lm-metric nqf-lm-metric--${kind}`;

  const k = document.createElement("span");
  k.className = "nqf-lm-k";
  k.textContent = key;
  row.appendChild(k);

  const barBox = document.createElement("span");
  barBox.className = "nqf-lm-bar";
  const fill = document.createElement("i");
  fill.className = `nqf-lm-bar-fill nqf-lm-fill--${slug}`;
  fill.style.width = `${widthPercent(value, total).toFixed(2)}%`;
  barBox.appendChild(fill);
  row.appendChild(barBox);

  const v = document.createElement("span");
  v.className = "nqf-lm-v";
  v.appendChild(document.createTextNode(`${formatInt(value)} `));
  const pct = document.createElement("span");
  pct.className = "nqf-lm-pct";
  pct.textContent = percentOne(value, total);
  v.appendChild(pct);
  row.appendChild(v);

  return row;
}

// 短行率・短チャンク率。1行の情報量が少ないほど高くなる要注意指標なのでバーは要注意色。
// 数値は「14:X / 20:Y」を小さい順に並べる（docs/spec/line-metadata.md「表示」節）。
// short30 は既存作品の分布で saturate しており判別力が薄く、狭い value 列に 3 数字を並べると
// 桁数超過でレイアウトが崩れるため、Chrome 拡張の表示からは落とす（data には残す）。
// バー幅は short20 側の比率で描く（残った 2 閾値の重篤上限。short14 は表示専用で警告色・
// スコア・バー駆動どちらにも参加させない）。
function shortMetricRow(
  kind: string,
  key: string,
  short14: number,
  short20: number,
  denominator: number,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `nqf-lm-metric nqf-lm-metric--${kind}`;

  const k = document.createElement("span");
  k.className = "nqf-lm-k";
  k.textContent = key;
  row.appendChild(k);

  const barBox = document.createElement("span");
  barBox.className = "nqf-lm-bar";
  const fill = document.createElement("i");
  fill.className = "nqf-lm-bar-fill nqf-lm-fill--warn";
  fill.style.width = `${widthPercent(short20, denominator).toFixed(2)}%`;
  barBox.appendChild(fill);
  row.appendChild(barBox);

  const v = document.createElement("span");
  v.className = "nqf-lm-v";
  v.appendChild(document.createTextNode("14:"));
  v.appendChild(hiValue(percentInt(short14, denominator)));
  v.appendChild(document.createTextNode(" / 20:"));
  v.appendChild(hiValue(percentInt(short20, denominator)));
  row.appendChild(v);

  return row;
}

function hiValue(text: string): HTMLSpanElement {
  const hi = document.createElement("span");
  hi.className = "nqf-lm-hi";
  hi.textContent = text;
  return hi;
}
