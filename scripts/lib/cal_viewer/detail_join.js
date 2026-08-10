// Detail パネルの正本×実験並列表示のためのjoinロジック。app.js（Preactグルー層）から切り出し、
// list_filter.js/line_meta.jsと同じくテスタブルな純関数として扱う。

// canonical/experimentの指標をkeyでjoinする。現状は実験式が正本と同じ指標キー集合を過不足なく
// 持つ（weights_experiment_test.tsで担保済み）が、cal_viewerの主目的が「weights_experimentへの
// 新指標追加を較正データで判断する」ことにあるため、片側にしか存在しないキー（実験のみの新指標・
// 正本のみのレガシー指標）も表示できるよう、両配列のkey和集合でjoinする。canonical側の並びを
// 優先し、実験のみのキーはその後ろに追加順で並ぶ。
export function joinMetrics(canonicalMetrics, experimentMetrics) {
  const canonicalByKey = new Map(canonicalMetrics.map((m) => [m.key, m]));
  const experimentByKey = new Map(experimentMetrics.map((m) => [m.key, m]));
  const keys = [...new Set([...canonicalByKey.keys(), ...experimentByKey.keys()])];
  return keys.map((key) => {
    const canonical = canonicalByKey.get(key);
    const experiment = experimentByKey.get(key);
    const bothPresent = canonical !== undefined && experiment !== undefined;
    return {
      key,
      label: canonical?.label ?? experiment?.label,
      canonical,
      experiment,
      // 片方しか存在しないキーは差分ゼロ状態と紛れないよう「差分なし」に倒す（Δ寄与も
      // 算出しない）。呼び出し側（app.js）は canonical/experiment いずれかがundefinedのセルを
      // 「-」表示にする。
      differ: bothPresent && canonical.contribution !== experiment.contribution,
      delta: bothPresent ? experiment.contribution - canonical.contribution : undefined,
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
