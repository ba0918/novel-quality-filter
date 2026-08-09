import type {
  CategoryCount,
  LineMetadata,
  MetricResult,
  NarrativeCount,
  PenaltyResult,
  ScoreResult,
} from "../../domain/types.ts";
import { formatOpeningContext } from "../../domain/analyzer/opening_format.ts";
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

function formatRawValue(value: number): string {
  if (value < 1) return (value * 100).toFixed(1) + "%";
  return value.toFixed(1);
}

// 行ベース文体メタデータ（診断用）。既存メトリクスとは別枠で、カテゴリ別の分量・短行率・
// 1行あたり平均文字数を表示する。本文由来テキストは含まないため textContent で安全に組み立てる。
function createLineMetadataSection(meta: LineMetadata): HTMLDivElement {
  const section = document.createElement("div");
  section.className = "nqf-line-metadata";

  const title = document.createElement("div");
  title.className = "nqf-detail-section-title";
  title.textContent = "行メタデータ";
  section.appendChild(title);

  const summary = document.createElement("div");
  summary.className = "nqf-line-summary";
  summary.textContent =
    `総行数 ${meta.totalLines} / 総文字数 ${meta.totalChars} / 空行 ${meta.blankCount} / 区切り線 ${meta.separatorCount}`;
  section.appendChild(summary);

  const rows: Array<[string, CategoryCount]> = [
    ["地の文", meta.narrative],
    ["セリフ", meta.dialogue],
    ["メタ", meta.meta],
    ["非文末", meta.nonTerminal],
  ];
  for (const [label, count] of rows) {
    section.appendChild(createLineRow(label, count));
  }

  return section;
}

function isNarrativeCount(count: CategoryCount): count is NarrativeCount {
  return "chunkCount" in count;
}

function createLineRow(label: string, count: CategoryCount): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "nqf-line-row";

  const labelEl = document.createElement("span");
  labelEl.className = "nqf-line-label";
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const stats = document.createElement("span");
  stats.className = "nqf-line-stats";
  const avg = count.lineCount > 0 ? (count.charCount / count.lineCount).toFixed(1) : "0.0";
  const parts = [
    `${count.lineCount}行`,
    `平均${avg}字`,
    `文字数 ${count.charCount}`,
    `短行 20:${ratioPercent(count.short20, count.lineCount)} / 30:${
      ratioPercent(count.short30, count.lineCount)
    }`,
  ];
  if (isNarrativeCount(count)) {
    parts.push(`チャンク ${count.chunkCount}`);
    parts.push(
      `短チャンク 20:${ratioPercent(count.shortChunk20, count.chunkCount)} / 30:${
        ratioPercent(count.shortChunk30, count.chunkCount)
      }`,
    );
  }
  stats.textContent = parts.join(" / ");
  row.appendChild(stats);

  return row;
}

function ratioPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "-";
  return `${Math.round((numerator / denominator) * 100)}%`;
}
