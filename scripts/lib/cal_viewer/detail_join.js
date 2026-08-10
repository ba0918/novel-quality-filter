// Detail パネルの正本×実験並列表示のためのjoinロジック。app.js（Preactグルー層）から切り出し、
// list_filter.js/line_meta.jsと同じくテスタブルな純関数として扱う。

// canonical/experimentの指標をkeyでjoinする。実験式は正本と同じ指標キー集合を過不足なく持つ
// （weights_experiment_test.tsで担保済み）ため、Mapルックアップは必ずヒットする前提でよい。
export function joinMetrics(canonicalMetrics, experimentMetrics) {
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

// canonical/experimentのpenaltiesはいずれも「発火した規則のみ」の配列（src/domain/scoring/mod.ts
// がPENALTY_RULESをループし条件成立時だけpushする）。並列表示は両側の発火ラベルの和集合で行を作り、
// 片側でしか発火していない側はundefinedを返す（呼び出し側で「—」等に変換する）。
export function joinPenalties(canonicalPenalties, experimentPenalties) {
  const canonicalByLabel = new Map(canonicalPenalties.map((p) => [p.label, p]));
  const experimentByLabel = new Map(experimentPenalties.map((p) => [p.label, p]));
  const labels = [...new Set([...canonicalByLabel.keys(), ...experimentByLabel.keys()])];
  return labels.map((label) => ({
    label,
    canonical: canonicalByLabel.get(label),
    experiment: experimentByLabel.get(label),
  }));
}
