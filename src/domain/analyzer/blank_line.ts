// 空行（段落間の空白行）の比率。観測専用の診断指標であり、スコアリング
// （analyzeAll / METRIC_CONFIGS）には組み込まない。可読性を落とす空行スパムが
// 文長SDと独立した信号になり得るかを較正で見極めるために用いる。
export function analyzeBlankLineRatio(text: string): number {
  const lines = text.split(/\n/);
  const contentLines = lines.filter((l) => l.trim().length > 0);
  if (contentLines.length === 0) return 0;
  const blankLines = lines.length - contentLines.length;
  return blankLines / lines.length;
}
