// 較正ビューア（ブラウザ側）の値整形。Deno 側 src/domain/analyzer/dossier_format.ts の
// 対応関数と同じ入力に対して同じ出力を返すことを ../format_test.ts で担保する
// （dossier_format.ts 自体は work-page-injector.ts の DOM 描画から今も使われているため
// 共有モジュール化はせず、ブラウザで動く素の ESM としてここに再実装する）。

export function formatRawValue(value) {
  if (value < 1) return (value * 100).toFixed(1) + "%";
  return value.toFixed(1);
}

export function formatInt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function percentInt(numerator, denominator) {
  if (denominator === 0) return "-";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function percentOne(numerator, denominator) {
  if (denominator === 0) return "-";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function widthPercent(numerator, denominator) {
  if (denominator === 0) return 0;
  return Math.min(100, (numerator / denominator) * 100);
}

export function averagePerLineLabel(meta) {
  const denominator = meta.totalLines - meta.blankCount;
  if (denominator <= 0) return "-";
  return `${(meta.totalChars / denominator).toFixed(1)}字/行`;
}

export function averageCharsLabel(count) {
  if (count.lineCount === 0) return "-";
  return `${(count.charCount / count.lineCount).toFixed(1)}字`;
}

export function compositionSegments(meta) {
  return [
    ["narrative", meta.narrative.lineCount],
    ["dialogue", meta.dialogue.lineCount],
    ["meta", meta.meta.lineCount],
    ["nonterm", meta.nonTerminal.lineCount],
    ["blank", meta.blankCount],
    ["sep", meta.separatorCount],
  ];
}

// href 属性用のスキーム検証（dossier_format.safeHref と同じ判定ロジック）。ただし Preact は
// href を diff 時に n.setAttribute("href", value) 経由で設定する（width/height/href/list/...
// は JS プロパティ代入の対象から明示的に除外され、常に setAttribute 側に落ちる。Preact 本体の
// 属性設定処理で確認済み）。setAttribute は値を HTML として再パースしないため escapeHtml は
// 不要かつ有害（& が文字通り &amp; という文字列に化けて URL が壊れる）。危険なら "#" を返し、
// 許可するときは trim 済みの生 URL をそのまま返す（denoFormat.safeHref は HTML 文字列埋め込み
// 用に末尾で escapeHtml するため戻り値そのものは一致しない。一致させるのは「許可/拒否の判定」
// であって出力文字列ではない）。
export function safeHref(url) {
  const stripped = [...url].filter((ch) => ch.charCodeAt(0) > 0x20).join("");
  if (stripped.startsWith("//")) return "#";
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(stripped);
  if (scheme && !["http", "https"].includes(scheme[1].toLowerCase())) {
    return "#";
  }
  return url.trim();
}

// penalty multiplier の表示用 (dossier_format.ts と同期)。grade ペナルティの連続値を
// 小数第3位に丸めて末尾ゼロを削る。
export function formatPenaltyMultiplier(multiplier) {
  return String(Math.round(multiplier * 1000) / 1000);
}
