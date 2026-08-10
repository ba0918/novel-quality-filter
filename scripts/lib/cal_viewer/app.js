// 較正ビューアの描画本体。cal.json を fetch し、Preact + htm（ともに CDN 経由、ビルド不要）で
// サイドバー（一覧・検索・フィルタ・ソート）+ Detail（正本×実験の並列比較・行データ可視化）を描く。
// 絞り込み/ソートは list_filter.js、行データの集計は line_meta.js に切り出し済み（ここは組み立てのみ）。
// 値整形は ./format.js（dossier_format.ts と同期テスト済み）。

import { h, render } from "https://esm.sh/preact@10.28.3";
import { useEffect, useMemo, useState } from "https://esm.sh/preact@10.28.3/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { formatInt, formatRawValue, safeHref } from "./format.js";
import { rawMetricsRows } from "./raw_metrics.js";
import { applyFilters, LABEL_CHIPS, labelCounts } from "./list_filter.js";
import { bandSegments, categoryBreakdown, summarize } from "./line_meta.js";

const html = htm.bind(h);

const SIDEBAR_STORAGE_KEY = "cal-viewer.sidebar-open";

const DEFAULT_FILTERS = { query: "", labels: [], warn: false, bigDiff: false, sort: "diff-desc" };

const SORT_OPTIONS = [
  { value: "diff-desc", label: "Δ（実−正）降順" },
  { value: "canonical-desc", label: "正本スコア降順" },
  { value: "experiment-desc", label: "実験スコア降順" },
  { value: "label", label: "ラベル順" },
  { value: "title", label: "タイトル" },
];

// 行データの色帯・カテゴリカードで使う区分ごとの見た目定義（compositionSegments/bandSegments の
// slug と対応させる）。CSS変数名はstyle.cssの --band-* トークンと一致させる。
const BAND_META = {
  narrative: { legendLabel: "地の文", colorVar: "--band-narrative" },
  dialogue: { legendLabel: "セリフ", colorVar: "--band-dialogue" },
  meta: { legendLabel: "メタ", colorVar: "--band-meta" },
  nonterm: { legendLabel: "非文末", colorVar: "--band-nonterm" },
  blank: { legendLabel: "空行", colorVar: "--band-blank" },
  sep: { legendLabel: "区切り", colorVar: "--band-sep" },
};

// カテゴリカードの並び（地の文/セリフ/メタ/非文末）。LineMetadata のキー名とBAND_METAのslugは
// nonTerminal/nontermのように綴りが異なるため対応表を持つ。
const CATEGORY_CARDS = [
  { key: "narrative", bandKey: "narrative" },
  { key: "dialogue", bandKey: "dialogue" },
  { key: "meta", bandKey: "meta" },
  { key: "nonTerminal", bandKey: "nonterm" },
];

function loadSidebarOpen() {
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

function saveSidebarOpen(open) {
  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
}

// スコア（常に整数、src/domain/scoring/mod.tsでMath.round済み）をtabular-nums表示に揃える。
function scoreLabel(score) {
  return score.toFixed(1);
}

// 符号付き数値表示。0は符号なし、正は+、負は全角マイナス（−）で統一する（モック準拠）。
function formatSigned(n, digits) {
  if (n === 0) return "0";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toFixed(digits)}`;
}

function diffClassName(diff) {
  if (diff > 0) return "diff-pos";
  if (diff < 0) return "diff-neg";
  return "";
}

// ラベル文字列 → chipのCSSクラス。良/ゴミ/対象外は専用色、それ以外（cal tagで付けた任意タグ）は
// 対象外と同じ中立色（out）を流用する（専用スタイルの用意が無いため）。
function labelChipClass(label) {
  if (label === "良") return "chip good";
  if (label === "ゴミ") return "chip bad";
  return "chip out";
}

function LabelChips({ labels }) {
  if (labels.length === 0) return html`<span class="chip unlabeled">未</span>`;
  return labels.map((label) =>
    html`<span class=${labelChipClass(label)} key=${label}>${label}</span>`
  );
}

function toggleInArray(arr, value) {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function filterChipClass(label, active) {
  if (!active) return "filter-chip";
  if (label === "良") return "filter-chip active good";
  if (label === "ゴミ") return "filter-chip active bad";
  return "filter-chip active";
}

function ListRow({ work, selected, onSelect }) {
  return html`
    <div
      class=${selected ? "list-row selected" : "list-row"}
      onClick=${() => onSelect(work.siteWorkId)}
    >
      <div class="list-row-title">${work.title}</div>
      <div class="list-row-scores">
        <span class="canon">${scoreLabel(work.canonical.score)}</span>${" "}
        →${" "}${scoreLabel(work.experiment.score)}${" "}
        <span class=${diffClassName(work.diff)}>${formatSigned(work.diff, 1)}</span>
      </div>
      <div class="list-row-meta">
        <${LabelChips} labels=${work.labels} />
        <span class="author">${work.author}</span>
      </div>
    </div>
  `;
}

function SidebarFilters({ allWorks, filters, onFilterChange }) {
  const counts = useMemo(() => labelCounts(allWorks), [allWorks]);
  return html`
    <div class="sidebar-filters">
      <input
        class="search-input"
        type="text"
        placeholder="🔎 タイトル・作者で絞り込み"
        value=${filters.query}
        onInput=${(e) => onFilterChange({ query: e.target.value })}
      />
      <div class="chip-row">
        ${LABEL_CHIPS.map((label) =>
          html`
            <button
              key=${label}
              class=${filterChipClass(label, filters.labels.includes(label))}
              onClick=${() => onFilterChange({ labels: toggleInArray(filters.labels, label) })}
            >${label} ${counts[label]}</button>
          `
        )}
      </div>
      <div class="chip-row">
        <button
          class=${filterChipClass("要注意", filters.warn)}
          title="正本または実験式で1つ以上の指標がflaggedな作品"
          onClick=${() => onFilterChange({ warn: !filters.warn })}
        >要注意</button>
        <button
          class=${filterChipClass("実験影響大", filters.bigDiff)}
          title="実験式スコアが正本から|Δ|≥3動いた作品"
          onClick=${() => onFilterChange({ bigDiff: !filters.bigDiff })}
        >実験影響大</button>
      </div>
      <div class="sort-row">
        <label>並び</label>
        <select
          class="sort-select"
          value=${filters.sort}
          onChange=${(e) => onFilterChange({ sort: e.target.value })}
        >
          ${SORT_OPTIONS.map(({ value, label }) =>
            html`<option value=${value} key=${value}>${label}</option>`
          )}
        </select>
      </div>
    </div>
  `;
}

function Sidebar(
  { works, allWorks, filters, onFilterChange, selectedId, onSelect, open, onToggle },
) {
  if (!open) {
    return html`
      <aside class="sidebar">
        <div class="sidebar-head">
          <button class="icon-btn" title="サイドバーを開く" onClick=${onToggle}>›</button>
        </div>
        <div class="collapsed-hint" onClick=${onToggle}>
          較正一覧 ${works.length}/${allWorks.length}
        </div>
      </aside>
    `;
  }
  return html`
    <aside class="sidebar">
      <div class="sidebar-head">
        <div class="sidebar-title">較正一覧 <span class="count">${works.length} / ${allWorks
          .length}</span></div>
        <button class="icon-btn" title="サイドバーを折りたたむ" onClick=${onToggle}>‹</button>
      </div>
      <${SidebarFilters} allWorks=${allWorks} filters=${filters} onFilterChange=${onFilterChange} />
      <div class="sidebar-list">
        ${works.map((w) =>
          html`
            <${ListRow}
              key=${w.siteWorkId}
              work=${w}
              selected=${w.siteWorkId === selectedId}
              onSelect=${onSelect}
            />
          `
        )}
      </div>
    </aside>
  `;
}

function MetaHeader({ work }) {
  const href = safeHref(work.url);
  return html`
    <div class="meta-header">
      <div class="eyebrow">Detail</div>
      <h1>${work.title}</h1>
      <div class="meta-author">${work.author}</div>
      <div class="meta-labels">
        <${LabelChips} labels=${work.labels} />
      </div>
      <a class="meta-url" href=${href} target="_blank" rel="noopener noreferrer">${work.url} ↗</a>
      <div class="meta-grid">
        <div class="meta-item"><span class="k">総文字数</span><span class="v">${formatInt(
          work.meta.totalCharacterCount,
        )}</span></div>
        <div class="meta-item"><span class="k">レビュー数</span><span class="v">${formatInt(
          work.meta.reviewCount,
        )}</span></div>
        <div class="meta-item"><span class="k">レビュー点</span><span class="v">${formatInt(
          work.meta.totalReviewPoint,
        )}</span></div>
        <div class="meta-item"><span class="k">開幕形式</span><span class="v">${work.meta
          .openingType}</span></div>
        <div
          class="meta-item"><span class="k">サンプル話数</span><span class="v">${formatInt(
            work.meta.sampledCount,
          )}</span></div>
        <div class="meta-item"><span class="k">収集日</span><span class="v">${work.meta.crawledAt
          .slice(0, 10)}</span></div>
      </div>
    </div>
  `;
}

function ScoreSection({ work }) {
  const diffClass = work.diff < 0 ? "neg" : work.diff === 0 ? "zero" : "";
  return html`
    <div class="section">
      <div class="score-section">
        <div class="score-card">
          <div class="eyebrow">Canonical</div>
          <div class="num">${scoreLabel(work.canonical.score)}</div>
          <div class="sub">weights.ts</div>
        </div>
        <div class="score-card">
          <div class="eyebrow">Experiment</div>
          <div class="num experiment">${scoreLabel(work.experiment.score)}</div>
          <div class="sub">weights_experiment.ts</div>
        </div>
        <div class="score-diff">
          <div class="eyebrow">Diff</div>
          <div class=${`num ${diffClass}`}>${formatSigned(work.diff, 1)}</div>
          <div class="sub">exp − can</div>
        </div>
      </div>
    </div>
  `;
}

// canonical/experimentの指標をkeyでjoinする。実験式は正本と同じ指標キー集合を過不足なく持つ
// （weights_experiment_test.tsで担保済み）ため、Mapルックアップは必ずヒットする前提でよい。
function joinMetrics(canonicalMetrics, experimentMetrics) {
  const experimentByKey = new Map(experimentMetrics.map((m) => [m.key, m]));
  return canonicalMetrics.map((canonical) => {
    const experiment = experimentByKey.get(canonical.key);
    return {
      key: canonical.key,
      label: canonical.label,
      canonical,
      experiment,
      differ: canonical.contribution !== experiment.contribution,
      delta: experiment.contribution - canonical.contribution,
    };
  });
}

function normPercent(metric) {
  return `${Math.round(metric.normalizedValue * 100)}%`;
}

function MetricsTable({ work }) {
  const rows = joinMetrics(work.canonical.metrics, work.experiment.metrics);
  return html`
    <div class="section">
      <h3>指標内訳 <span class="raw-note">正本 vs 実験式（${rows.length}指標）</span></h3>
      <div
        class="section-note">差分がある行は淡いインディゴ背景。normalized / weight / contribution / flagを並列</div>
      <div class="metrics-table-wrap">
        <table class="metrics-table">
          <thead>
            <tr>
              <th>指標</th>
              <th>raw</th>
              <th class="group">正 norm</th>
              <th>正 wt</th>
              <th>正 寄与</th>
              <th class="group experiment-group">実 norm</th>
              <th class="experiment-group">実 wt</th>
              <th class="experiment-group">実 寄与</th>
              <th>Δ寄与</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) =>
              html`
                <tr key=${row.key} class=${row.differ ? "differ" : ""}>
                  <td class="metric-label">
                    ${row.label}${(row.canonical.flagged || row.experiment.flagged)
                      ? html`<span class="metric-flag">FLAG</span>`
                      : ""}
                    <br />
                    <span class="metric-key">${row.key}</span>
                  </td>
                  <td>${formatRawValue(row.canonical.rawValue)}</td>
                  <td class="group">${normPercent(row.canonical)}</td>
                  <td>${row.canonical.weight.toFixed(2)}</td>
                  <td>${row.canonical.contribution.toFixed(2)}</td>
                  <td class="group">${normPercent(row.experiment)}</td>
                  <td>${row.experiment.weight.toFixed(2)}</td>
                  <td>${row.experiment.contribution.toFixed(2)}</td>
                  <td class=${`metric-diff ${
                    row.delta > 0 ? "pos" : row.delta < 0 ? "neg" : "zero"
                  }`}>
                    ${formatSigned(row.delta, 2)}
                  </td>
                </tr>
              `
            )}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// canonical/experimentのpenaltiesはいずれも「発火した規則のみ」の配列（src/domain/scoring/mod.ts
// がPENALTY_RULESをループし条件成立時だけpushする）。並列表示は両側の発火ラベルの和集合で行を作り、
// 非発火側は multiplier 欄に "—" を出す（×1.00は「ルールのカタログ乗率」を意味してしまい
// 実際に掛かった値と誤認されるため使わない）。
function joinPenalties(canonicalPenalties, experimentPenalties) {
  const canonicalByLabel = new Map(canonicalPenalties.map((p) => [p.label, p]));
  const experimentByLabel = new Map(experimentPenalties.map((p) => [p.label, p]));
  const labels = [...new Set([...canonicalByLabel.keys(), ...experimentByLabel.keys()])];
  return labels.map((label) => ({
    label,
    canonical: canonicalByLabel.get(label),
    experiment: experimentByLabel.get(label),
  }));
}

function PenaltyMultiplier({ penalty, side }) {
  return html`
    <div class=${`penalty-mult ${side}`}>${penalty
      ? `×${penalty.multiplier.toFixed(2)}`
      : "—"}</div>
  `;
}

function PenaltyList({ work }) {
  const rows = joinPenalties(work.canonical.penalties, work.experiment.penalties);
  return html`
    <div class="section">
      <h3>ペナルティ <span class="raw-note">条件式ベース</span></h3>
      <div class="section-note">正本または実験のいずれかで発火した規則を並列表示（非発火側は—）</div>
      ${rows.length === 0 ? html`<div class="penalty-none">なし</div>` : html`
        <div class="penalty-list">
          ${rows.map((row) =>
            html`
              <div class="penalty-row active" key=${row.label}>
                <div class="name">${row.label}</div>
                <${PenaltyMultiplier} penalty=${row.canonical} side="canonical" />
                <${PenaltyMultiplier} penalty=${row.experiment} side="experiment" />
              </div>
            `
          )}
        </div>
      `}
    </div>
  `;
}

// rawMetricsは正本/実験で不変のためデータ・ロジックは既存のまま（rawMetricsRowsを差し替えない）。
// マークアップのみモック準拠のraw-grid/raw-rowへ差し替える。
function RawMetricsView({ rawMetrics, scoredMetrics }) {
  if (!rawMetrics) return null;
  const rows = rawMetricsRows(rawMetrics, scoredMetrics);
  return html`
    <div class="section">
      <h3>rawMetrics（本文由来） <span class="raw-note">正本/実験で不変・${rows
        .length}項目</span></h3>
      <div class="section-note">
        <strong>採点対象</strong>（${scoredMetrics.length}）と<strong>非採点rawのみ</strong>
        （${rows.length - scoredMetrics.length}）を含む
      </div>
      <div class="raw-grid">
        ${rows.map(([key, label, display]) =>
          html`
            <div class="raw-row" key=${key}>
              <span class="k">${label}<span class="subk">${key}</span></span>
              <span class="v">${display}</span>
            </div>
          `
        )}
      </div>
    </div>
  `;
}

function AmountRow({ label, entry, colorVar }) {
  return html`
    <div class="cat-metric">
      <span class="cm-k">${label}</span>
      <div class="cm-bar">
        <div style=${`width:${entry.ratio * 100}%;background:var(${colorVar})`}></div>
      </div>
      <span class="cm-v">${formatInt(entry.value)} (${entry.ratioLabel})</span>
    </div>
  `;
}

function ShortRow({ label, entry20, entry30 }) {
  const warn = entry20.warn || entry30.warn;
  return html`
    <div class=${warn ? "cat-metric warn" : "cat-metric"}>
      <span class="cm-k">${label}</span>
      <div class="cm-bar">
        <div style=${`width:${entry20.ratio * 100}%;background:var(--bad)`}></div>
      </div>
      <span class="cm-v">20:${entry20.ratioLabel} / 30:${entry30.ratioLabel}</span>
    </div>
  `;
}

function CategoryCard({ lineMetadata, categoryKey, bandKey }) {
  const breakdown = categoryBreakdown(lineMetadata, categoryKey);
  const meta = BAND_META[bandKey];
  return html`
    <div class="cat-card">
      <div class="cat-head">
        <div class="cat-name">
          <span class="sw" style=${`background:var(${meta.colorVar})`}></span>${meta.legendLabel}
        </div>
        <div class="cat-avg">
          平均 ${breakdown.avgCharsLabel}${breakdown.chunkCountLabel !== undefined
            ? ` / チャンク ${breakdown.chunkCountLabel}`
            : ""}
        </div>
      </div>
      <div class="cat-metrics">
        <${AmountRow} label="行" entry=${breakdown.lineCount} colorVar=${meta.colorVar} />
        <${AmountRow} label="文字" entry=${breakdown.charCount} colorVar=${meta.colorVar} />
        <${ShortRow} label="短行" entry20=${breakdown.short20} entry30=${breakdown.short30} />
        ${breakdown.shortChunk20 !== undefined
          ? html`<${ShortRow} label="短チャンク" entry20=${breakdown.shortChunk20} entry30=${breakdown.shortChunk30} />`
          : ""}
      </div>
    </div>
  `;
}

function LineMetaSection({ lineMetadata }) {
  if (!lineMetadata) return null;
  const summary = summarize(lineMetadata);
  const segments = bandSegments(lineMetadata);
  return html`
    <div class="section">
      <h3>行メタデータ <span class="raw-note">Chrome拡張準拠・正本/実験で不変</span></h3>
      <div
        class="section-note">新指標（例: 平均字/行、地の文短行率）をweights_experimentに足すか判断する材料</div>
      <div class="line-meta">
        <div class="line-summary">
          <div class="stats">
            <div class="stat"><span class="k">総行数</span>${formatInt(summary.totalLines)}</div>
            <div class="stat"><span class="k">総文字数</span>${formatInt(summary.totalChars)}</div>
            <div class="stat">
              <span class="k">空行</span>${formatInt(summary.blankCount)}（${summary
                .blankRatioLabel}）
            </div>
            <div class="stat">
              <span class="k">区切り線</span>${formatInt(summary.separatorCount)}（${summary
                .separatorRatioLabel}）
            </div>
          </div>
          <div class="highlight-chips">
            <span class="chip-hl">平均 ${summary.averagePerLine}</span>
            <span class=${summary.narrativeShort30.warn ? "chip-hl warn" : "chip-hl"}>
              地の文 短行30 ${summary.narrativeShort30.ratioLabel}
            </span>
          </div>
        </div>
        <div class="band" role="img" aria-label="行の構成比">
          ${segments.map(([name, width]) =>
            html`
              <div
                key=${name}
                style=${`width:${width.toFixed(2)}%;background:var(${BAND_META[name].colorVar})`}
              ></div>
            `
          )}
        </div>
        <div class="band-legend">
          ${segments.map(([name, width]) =>
            html`
              <span key=${name}>
                <span class="sw" style=${`background:var(${BAND_META[name].colorVar})`}></span>
                ${BAND_META[name].legendLabel} ${width.toFixed(1)}%
              </span>
            `
          )}
        </div>
        <div class="cat-grid">
          ${CATEGORY_CARDS.map(({ key, bandKey }) =>
            html`<${CategoryCard} key=${key} lineMetadata=${lineMetadata} categoryKey=${key} bandKey=${bandKey} />`
          )}
        </div>
      </div>
    </div>
  `;
}

function DetailPanel({ work }) {
  if (!work) {
    return html`<div class="detail detail--empty">一覧から作品を選んでください</div>`;
  }
  return html`
    <div class="detail">
      <${MetaHeader} work=${work} />
      <${ScoreSection} work=${work} />
      <${MetricsTable} work=${work} />
      <${PenaltyList} work=${work} />
      <${RawMetricsView} rawMetrics=${work.rawMetrics} scoredMetrics=${work.canonical.metrics} />
      <${LineMetaSection} lineMetadata=${work.lineMetadata} />
    </div>
  `;
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(loadSidebarOpen);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

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
  const filtered = useMemo(() => applyFilters(works, filters), [works, filters]);
  const selected = works.find((w) => w.siteWorkId === selectedId);

  const toggleSidebar = () => {
    setSidebarOpen((open) => {
      const next = !open;
      saveSidebarOpen(next);
      return next;
    });
  };

  const updateFilters = (patch) => setFilters((f) => ({ ...f, ...patch }));

  if (error) return html`<p class="error">${error}</p>`;
  if (!data) return html`<p>読み込み中...</p>`;

  return html`
    <div class=${sidebarOpen ? "app" : "app collapsed"}>
      <${Sidebar}
        works=${filtered}
        allWorks=${works}
        filters=${filters}
        onFilterChange=${updateFilters}
        selectedId=${selectedId}
        onSelect=${setSelectedId}
        open=${sidebarOpen}
        onToggle=${toggleSidebar}
      />
      <main class="main">
        <${DetailPanel} work=${selected} />
      </main>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
