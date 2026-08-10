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
