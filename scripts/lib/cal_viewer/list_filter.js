// サイドバーの絞り込み・並び替えの純関数。UI（app.js）から切り離してテスタブルにする
// （format.js / raw_metrics.js と同じ「計算は cal_viewer/*.js に集約」パターン）。

export const LABEL_CHIPS = ["良", "ゴミ", "対象外", "未"];

// work.labels は cal.json 上 undefined になり得る（labels_store 側の labelsFor が空配列 or
// undefined を返す）。参照箇所を毎回 `work.labels && ...` で個別にガードすると漏れの元になる
// ため、この関数を唯一の入口にする（app.js のレンダリング側もこれ経由で読む）。
export function labelsOf(work) {
  return work.labels ?? [];
}

function isUnlabeled(work) {
  return labelsOf(work).length === 0;
}

// 「未」は quality/scope/tags いずれのラベルも1件も付いていない状態を指す。良/ゴミ/対象外は
// cal.json の labels 配列にそのまま含まれる文字列として判定する。
function matchesLabel(work, label) {
  return label === "未" ? isUnlabeled(work) : labelsOf(work).includes(label);
}

function matchSearch(work, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return work.title.toLowerCase().includes(q) || work.author.toLowerCase().includes(q);
}

function matchLabels(work, labels) {
  if (!labels || labels.length === 0) return true;
  return labels.some((label) => matchesLabel(work, label));
}

// 「要注意」: 正本・実験いずれかの指標内訳で1つ以上 flagged が立っている作品。良ラベルなのに
// flag が立っていればペナルティ設計を疑う材料、ゴミラベルなのに flag が無ければ検知漏れの材料。
export function hasFlagged(work) {
  return work.canonical.metrics.some((m) => m.flagged) ||
    work.experiment.metrics.some((m) => m.flagged);
}

function isBigDiff(work) {
  return Math.abs(work.diff) >= 3;
}

// ラベル順ソートの優先度。良→ゴミ→対象外→未の順（サイドバーのチップ表示順と揃える）。
const LABEL_RANK = { "良": 0, "ゴミ": 1, "対象外": 2 };

function labelRank(work) {
  const labels = labelsOf(work);
  for (const label of ["良", "ゴミ", "対象外"]) {
    if (labels.includes(label)) return LABEL_RANK[label];
  }
  return 3; // 未
}

const SORTERS = {
  "diff-desc": (a, b) => b.diff - a.diff,
  "canonical-desc": (a, b) => b.canonical.score - a.canonical.score,
  "experiment-desc": (a, b) => b.experiment.score - a.experiment.score,
  "label": (a, b) => labelRank(a) - labelRank(b) || a.title.localeCompare(b.title, "ja"),
  "title": (a, b) => a.title.localeCompare(b.title, "ja"),
};

function sorterFor(sortKey) {
  return SORTERS[sortKey] ?? SORTERS["diff-desc"];
}

// 入力: works（cal.json の works）、filters（現在の絞り込み状態）。
// 出力: 表示対象の works（フィルタ後・ソート後）。各絞り込み条件はANDで合成する。
export function applyFilters(works, filters) {
  const f = filters ?? {};
  return works
    .filter((w) => matchSearch(w, f.query))
    .filter((w) => matchLabels(w, f.labels))
    .filter((w) => !f.warn || hasFlagged(w))
    .filter((w) => !f.bigDiff || isBigDiff(w))
    .sort(sorterFor(f.sort));
}

// サイドバーのラベルチップに表示する件数（良3 / ゴミ4 / 対象外2 / 未99 のような表示）。
// 絞り込み前の全作品を対象に数える。
export function labelCounts(works) {
  const counts = { "良": 0, "ゴミ": 0, "対象外": 0, "未": 0 };
  for (const w of works) {
    for (const label of LABEL_CHIPS) {
      if (matchesLabel(w, label)) counts[label]++;
    }
  }
  return counts;
}
