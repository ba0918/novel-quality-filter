// 較正ビューアの描画本体。cal.json を fetch し、Preact + htm（ともに CDN 経由、ビルド不要）で
// 一覧テーブルと詳細パネルを描く。値整形は ./format.js（dossier_format.ts と同期テスト済み）。

import { h, render } from "https://esm.sh/preact@10.28.3";
import { useEffect, useMemo, useState } from "https://esm.sh/preact@10.28.3/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import {
  averageCharsLabel,
  averagePerLineLabel,
  compositionSegments,
  formatInt,
  formatRawValue,
  percentInt,
  percentOne,
  safeHref,
  widthPercent,
} from "./format.js";
import { averageCharCountLabel, rawMetricsRows } from "./raw_metrics.js";

const html = htm.bind(h);

const SORT_COLUMNS = {
  title: (w) => w.title,
  canonical: (w) => w.canonical.score,
  experiment: (w) => w.experiment.score,
  diff: (w) => w.diff,
};

function sortWorks(works, sortKey, sortDir) {
  const keyFn = SORT_COLUMNS[sortKey] ?? SORT_COLUMNS.diff;
  const sorted = [...works].sort((a, b) => {
    const av = keyFn(a);
    const bv = keyFn(b);
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  return sortDir === "desc" ? sorted.reverse() : sorted;
}

function filterWorks(works, labelFilter) {
  if (!labelFilter) return works;
  return works.filter((w) => w.labels.includes(labelFilter));
}

function collectLabels(works) {
  const set = new Set();
  for (const w of works) for (const label of w.labels) set.add(label);
  return [...set].sort();
}

function metricByKey(work, key) {
  return work.rawMetrics[key];
}

function SortHeader({ label, column, sortKey, sortDir, onSort }) {
  const active = column === sortKey;
  const indicator = active ? (sortDir === "desc" ? " ▼" : " ▲") : "";
  return html`<th class="cal-sortable" onClick=${() => onSort(column)}>${label}${indicator}</th>`;
}

function ListTable({ works, selectedId, onSelect, sortKey, sortDir, onSort }) {
  return html`
    <table class="cal-list">
      <thead>
        <tr>
          <${SortHeader} label="タイトル" column="title" sortKey=${sortKey} sortDir=${sortDir}
            onSort=${onSort} />
          <th>作者</th>
          <th>ラベル</th>
          <${SortHeader} label="正本" column="canonical" sortKey=${sortKey} sortDir=${sortDir}
            onSort=${onSort} />
          <${SortHeader} label="実験" column="experiment" sortKey=${sortKey} sortDir=${sortDir}
            onSort=${onSort} />
          <${SortHeader} label="差分" column="diff" sortKey=${sortKey} sortDir=${sortDir}
            onSort=${onSort} />
          <th>平均文字数</th>
          <th>文長SD</th>
          <th>地の文短行30</th>
        </tr>
      </thead>
      <tbody>
        ${works.map((w) =>
          html`
            <tr
              class=${w.siteWorkId === selectedId ? "cal-row cal-row--selected" : "cal-row"}
              onClick=${() => onSelect(w.siteWorkId)}
            >
              <td>${w.title}</td>
              <td class="cal-muted">${w.author}</td>
              <td>${w.labels.join(", ") || "-"}</td>
              <td class="cal-num">${w.canonical.score}</td>
              <td class="cal-num">${w.experiment.score}</td>
              <td class=${w.diff > 0
                ? "cal-num cal-up"
                : w.diff < 0
                ? "cal-num cal-down"
                : "cal-num"}>
                ${w.diff > 0 ? `+${w.diff}` : w.diff}
              </td>
              <td class="cal-num">${averageCharCountLabel(w.rawMetrics)}</td>
              <td class="cal-num">${formatRawValue(metricByKey(w, "sentenceLengthSD"))}</td>
              <td class="cal-num">
                ${w.lineMetadata
                  ? percentInt(w.lineMetadata.narrative.short30, w.lineMetadata.narrative.lineCount)
                  : "-"}
              </td>
            </tr>
          `
        )}
      </tbody>
    </table>
  `;
}

function MetricRow({ metric }) {
  const norm = Math.round(metric.normalizedValue * 100);
  return html`
    <div class=${metric.flagged ? "cal-metric-row cal-metric-row--flagged" : "cal-metric-row"}>
      <span class="cal-metric-label">${metric.label}</span>
      <span class="cal-metric-raw">${formatRawValue(metric.rawValue)}</span>
      <span class="cal-metric-bar-container">
        <span class="cal-metric-bar" style=${`width:${norm}%`}></span>
      </span>
      <span class="cal-metric-norm">${norm}%</span>
    </div>
  `;
}

function PenaltyList({ penalties }) {
  if (penalties.length === 0) {
    return html`<div class="cal-penalty-none">なし</div>`;
  }
  return html`
    <div>
      ${penalties.map((p) =>
        html`
          <div class="cal-penalty-row">
            <span>${p.label}</span>
            <span>x${p.multiplier}</span>
          </div>
        `
      )}
    </div>
  `;
}

function LineMetadataView({ meta }) {
  if (!meta) return null;
  const categories = [
    { label: "地の文", count: meta.narrative },
    { label: "セリフ", count: meta.dialogue },
    { label: "メタ", count: meta.meta },
    { label: "非文末", count: meta.nonTerminal },
  ];
  const segments = compositionSegments(meta);
  return html`
    <div class="cal-line-metadata">
      <div class="cal-lm-headline">
        <span class="cal-chip">平均 ${averagePerLineLabel(meta)}</span>
        <span class="cal-chip cal-chip--concern">
          地の文 短行30 ${percentInt(meta.narrative.short30, meta.narrative.lineCount)}
        </span>
      </div>
      <div class="cal-lm-summary">
        総行数 ${formatInt(meta.totalLines)} / 総文字数 ${formatInt(meta.totalChars)}
        / 空行 ${percentInt(meta.blankCount, meta.totalLines)}
        / 区切り線 ${percentInt(meta.separatorCount, meta.totalLines)}
      </div>
      <div class="cal-lm-compo" role="img" aria-label="行の構成比">
        ${segments.map(([slug, count]) =>
          html`
            <span
              class=${`cal-lm-seg cal-lm-seg--${slug}`}
              style=${`width:${widthPercent(count, meta.totalLines).toFixed(2)}%`}
            ></span>
          `
        )}
      </div>
      ${categories.map((c) =>
        html`
          <div class="cal-lm-cat">
            <div class="cal-lm-cat-head">
              <span>${c.label}</span>
              <span class="cal-muted">
                平均 ${averageCharsLabel(c.count)}${c.count.chunkCount !== undefined
                  ? ` / チャンク ${formatInt(c.count.chunkCount)}`
                  : ""}
              </span>
            </div>
            <div class="cal-lm-cat-body cal-muted">
              行 ${formatInt(c.count.lineCount)}（${percentOne(
                c.count.lineCount,
                meta.totalLines,
              )}）
              / 文字 ${formatInt(c.count.charCount)}（${percentOne(
                c.count.charCount,
                meta.totalChars,
              )}）
              / 短行 20:${percentInt(c.count.short20, c.count.lineCount)}
              30:${percentInt(c.count.short30, c.count.lineCount)}
            </div>
          </div>
        `
      )}
    </div>
  `;
}

function FormulaBlock({ title, result }) {
  return html`
    <div class="cal-formula-block">
      <div class="cal-formula-head">
        <span class="cal-formula-title">${title}</span>
        <span class="cal-formula-score">${result.score}</span>
      </div>
      <div class="cal-detail-section-title">指標</div>
      ${result.metrics.map((m) => html`<${MetricRow} metric=${m} />`)}
      <div class="cal-detail-section-title cal-detail-section-title--penalty">ペナルティ</div>
      <${PenaltyList} penalties=${result.penalties} />
    </div>
  `;
}

function RawMetricsView({ rawMetrics, scoredMetrics }) {
  if (!rawMetrics) return null;
  const rows = rawMetricsRows(rawMetrics, scoredMetrics);
  return html`
    <div class="cal-raw-metrics">
      <div class="cal-detail-section-title">rawMetrics（全指標）</div>
      ${rows.map(([key, label, display]) =>
        html`
          <div class="cal-raw-metric-row" key=${key}>
            <span class="cal-raw-metric-label">${label}</span>
            <span class="cal-raw-metric-value">${display}</span>
          </div>
        `
      )}
    </div>
  `;
}

function DetailPanel({ work }) {
  if (!work) {
    return html`<div class="cal-detail cal-detail--empty">一覧から作品を選んでください</div>`;
  }
  const href = safeHref(work.url);
  return html`
    <div class="cal-detail">
      <div class="cal-detail-head">
        <a href=${href} target="_blank" rel="noopener noreferrer">${work.title}</a>
        <span class="cal-muted">${work.author}</span>
      </div>
      <div class="cal-detail-meta cal-muted">
        レビュー ${formatInt(work.meta.reviewCount)}
        / 評価pt ${formatInt(work.meta.totalReviewPoint)}
        / 総文字 ${formatInt(work.meta.totalCharacterCount)}
        / seedTags ${work.meta.seedTags.join(", ") || "-"}
      </div>
      <div class="cal-formula-grid">
        <${FormulaBlock} title="正本" result=${work.canonical} />
        <${FormulaBlock} title="実験" result=${work.experiment} />
      </div>
      <${LineMetadataView} meta=${work.lineMetadata} />
      <${RawMetricsView} rawMetrics=${work.rawMetrics} scoredMetrics=${work.canonical.metrics} />
    </div>
  `;
}

function LabelFilter({ labels, value, onChange }) {
  return html`
    <select class="cal-label-filter" value=${value} onChange=${(e) => onChange(e.target.value)}>
      <option value="">すべて</option>
      ${labels.map((label) => html`<option value=${label}>${label}</option>`)}
    </select>
  `;
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [sortKey, setSortKey] = useState("diff");
  const [sortDir, setSortDir] = useState("desc");
  const [labelFilter, setLabelFilter] = useState("");

  useEffect(() => {
    fetch("./cal.json")
      .then((res) => {
        if (!res.ok) throw new Error(`cal.json の取得に失敗しました: ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  const works = data?.works ?? [];
  const labels = useMemo(() => collectLabels(works), [works]);
  const filtered = useMemo(() => filterWorks(works, labelFilter), [works, labelFilter]);
  const sorted = useMemo(() => sortWorks(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const selected = works.find((w) => w.siteWorkId === selectedId);

  const onSort = (column) => {
    if (column === sortKey) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(column);
      setSortDir("desc");
    }
  };

  if (error) return html`<p class="cal-error">${error}</p>`;
  if (!data) return html`<p>読み込み中...</p>`;

  return html`
    <div class="cal-app">
      <header class="cal-header">
        <h1>較正ビューア</h1>
        <p class="cal-muted">
          ${data.works.length}作品 / 生成: ${data.generatedAt}
          / 正本式: ${data.canonicalWeightsRef} / 実験式: ${data.experimentWeightsRef}
        </p>
        <${LabelFilter} labels=${labels} value=${labelFilter} onChange=${setLabelFilter} />
      </header>
      <div class="cal-layout">
        <${ListTable}
          works=${sorted}
          selectedId=${selectedId}
          onSelect=${setSelectedId}
          sortKey=${sortKey}
          sortDir=${sortDir}
          onSort=${onSort}
        />
        <${DetailPanel} work=${selected} />
      </div>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
