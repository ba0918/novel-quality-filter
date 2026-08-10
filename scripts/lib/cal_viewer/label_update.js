// ラベル更新の純関数。EditableLabelChip の optimistic UI から呼ばれ、cal.json の
// works[].labels（labels_store.labelsFor で作られたフラット配列）を、新値へ差し替えた
// 配列を返す。cal tag で付けた任意タグは維持する（quality/scope の付け替えだけを扱う）。

const QUALITY_VALUES = new Set(["良", "駄"]);
const RESERVED = new Set(["良", "駄", "対象外"]);

// 「対象外」選択で既存 quality を残す理由は、対象外にする動機が多様（連載停止・非小説・
// 様子見・後で再判定したい）で、破棄すると「一時的に対象外」の使い方が壊れるため。
// server 側 labels_store.setLabel も同じ挙動（scope 更新のみで quality 保持）なので、
// UI と server を寄せて、リロード前後で primary chip が飛ぶ現象を避ける。
export function computeNextLabels(currentLabels, nextValue) {
  const tags = currentLabels.filter((l) => !RESERVED.has(l));
  if (nextValue === null) return [];
  if (nextValue === "対象外") {
    const existingQuality = currentLabels.find((l) => QUALITY_VALUES.has(l));
    return existingQuality ? [existingQuality, "対象外", ...tags] : ["対象外", ...tags];
  }
  return [nextValue, ...tags];
}

// Detail の meta-header に表示する primary chip の選定。scope 軸を優先し、scope="対象外"
// なら「対象外」、対象なら quality（良/駄）、両方 undefined なら null（未表示）。
// labels 配列の並びに依存しない（labels_store.labelsFor の順序が変わっても壊れない）。
export function primaryLabelValue(labels) {
  if (labels.includes("対象外")) return "対象外";
  for (const l of labels) {
    if (QUALITY_VALUES.has(l)) return l;
  }
  return null;
}

// サイドバー行の chip 列。docs/spec/calibration-loop-tool.md「サイドバー行の chip も同じ
// 選定規則を適用する」に従い、Detail の primary chip と同じ scope 優先ルールで 1 個だけ
// 描く（[良+対象外] の作品は「対象外」1 個だけ）。primary が無ければ空配列を返し、
// LabelChips 側で unlabeled の「未」チップを出す。cal tag で付けた任意タグはサイドバーには
// 出さない（情報密度優先、Detail のみで secondary として見える）。
export function primaryChipLabels(labels) {
  const primary = primaryLabelValue(labels);
  return primary === null ? [] : [primary];
}
