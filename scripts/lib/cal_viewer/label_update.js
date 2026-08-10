// ラベル更新の純関数。EditableLabelChip の optimistic UI から呼ばれ、cal.json の
// works[].labels（labels_store.labelsFor で作られたフラット配列）を、新値へ差し替えた
// 配列を返す。cal tag で付けた任意タグは維持する（quality/scope の付け替えだけを扱う）。

const RESERVED = new Set(["良", "駄", "対象外"]);

export function computeNextLabels(currentLabels, nextValue) {
  const tags = currentLabels.filter((l) => !RESERVED.has(l));
  if (nextValue === null) return [];
  if (nextValue === "対象外") return ["対象外", ...tags];
  return [nextValue, ...tags];
}
