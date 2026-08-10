// 指標内訳テーブルの2軸表示（max / 寄与tier / -pt）向けヘルパ。app.js から切り出した純関数。
// weight・contributionはいずれもcanonical/experimentのMetricResult由来（src/domain/scoring）で、
// normalizedValueが[0,1]の間である前提のもとcontributionはmaxContribution以下に収まる。

// weightから満点時の潜在影響力（pt）を求める。normalizedValue=1（満点）のときcontributionが
// 到達しうる上限がweight×100。
export function maxContribution(weight) {
  return weight * 100;
}

// 寄与の達成率（contribution / maxContribution）から4段階の色分けtierを返す。
// weight=0（maxContribution=0）の指標はゼロ除算を避け、シグナルなし扱いのneutralに倒す。
export function contributionTier(contribution, maxContribution) {
  if (maxContribution === 0) return "neutral";
  const ratio = contribution / maxContribution;
  if (ratio >= 0.8) return "good";
  if (ratio >= 0.6) return "neutral";
  if (ratio >= 0.4) return "caution";
  return "bad";
}

// 直接減点額（取り損ねたpt）。満点との差分なので理論上は負にならないが、浮動小数の丸め誤差で
// contributionがmaxContributionをわずかに超えて計算される場合に備えて0未満は0に丸める。
export function deficit(contribution, maxContribution) {
  return Math.max(0, maxContribution - contribution);
}
