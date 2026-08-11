// 行データ（LineMetadata）セクションの集計・整形。Chrome拡張の詳細カード
// （work-page-injector.ts の createLineMetadataSection 系）と同等の粒度で描画するための値を
// 純関数として組み立てる。値整形の低レベル関数（percentInt/percentOne/widthPercent/
// averagePerLineLabel/averageCharsLabel/compositionSegments）は ./format.js のものを再利用し、
// dossier_format.ts との同期は format_test.ts が別途担保する（重複実装しない）。
//
// 「平均字/行」はcharCount/lineCountで、地の文の「平均」も同じ式（averageCharsLabel）を使う。
// チャンク数（chunkCount）はcharCountで割った平均ではなく生カウントを併記するだけ
// （work-page-injector.ts:442 と同じ表示規則。charCount/chunkCountという式は既存コードに
// 存在しない）。

import {
  averageCharsLabel,
  averagePerLineLabel,
  compositionSegments,
  formatInt,
  percentInt,
  percentOne,
  widthPercent,
} from "./format.js";

// 短行/短チャンク比率の警告閾値。ratio が超えたときだけwarnにする（「暫定 0.5」、"超え"なので
// ちょうど0.5は含まない）。Chrome拡張側は数値閾値を持たず短行/短チャンク行を常時強調表示だが、
// cal_viewerは較正時の判断材料として閾値超えのみ強調する設計にする（新規の表示ロジック）。
const SHORT_RATIO_WARN_THRESHOLD = 0.5;

export function isShortRatioWarn(ratio) {
  return ratio > SHORT_RATIO_WARN_THRESHOLD;
}

function ratioOf(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

// 総サマリ: 総行数/総文字数/空行率/区切り率 + 較正判断の焦点になる2チップ
// （平均字/行、地の文短行30率）を返す。
export function summarize(lineMetadata) {
  const narrativeShort30Ratio = ratioOf(
    lineMetadata.narrative.short30,
    lineMetadata.narrative.lineCount,
  );
  return {
    totalLines: lineMetadata.totalLines,
    totalChars: lineMetadata.totalChars,
    blankCount: lineMetadata.blankCount,
    blankRatioLabel: percentInt(lineMetadata.blankCount, lineMetadata.totalLines),
    separatorCount: lineMetadata.separatorCount,
    separatorRatioLabel: percentInt(lineMetadata.separatorCount, lineMetadata.totalLines),
    averagePerLine: averagePerLineLabel(lineMetadata),
    narrativeShort30: {
      ratioLabel: percentInt(lineMetadata.narrative.short30, lineMetadata.narrative.lineCount),
      warn: isShortRatioWarn(narrativeShort30Ratio),
    },
  };
}

// 色帯（地の文/セリフ/メタ/非文末/空行/区切り）の [区分名, 幅%] 配列。6区分の幅の合計は
// totalLinesに対する各カウントの割合の合計なので常に100%になる（totalLinesは6区分の排他分類の
// 合計と一致する仕様、line_metadata.ts参照）。
export function bandSegments(lineMetadata) {
  return compositionSegments(lineMetadata).map((
    [name, count],
  ) => [name, widthPercent(count, lineMetadata.totalLines)]);
}

// 行数/文字数のような「量」の指標。warnは持たない（短行/短チャンクのみが警告対象という設計を
// 区別するため、常にfalse固定で返す）。
function amountEntry(value, numerator, denominator) {
  return {
    value,
    ratio: ratioOf(numerator, denominator),
    ratioLabel: percentOne(numerator, denominator),
    warn: false,
  };
}

// 短行/短チャンクのような「率で警告しうる」指標。
function shortEntry(value, numerator, denominator) {
  const ratio = ratioOf(numerator, denominator);
  return {
    value,
    ratio,
    ratioLabel: percentInt(numerator, denominator),
    warn: isShortRatioWarn(ratio),
  };
}

// 短行14 / 短チャンク14 用の表示専用エントリ。docs/spec/line-metadata.md「表示」節の
// 契約「14 は warn 判定に参加させない」を型レベルで保証するため、warn を必ず false で返す。
// shortEntry と同じ形状のオブジェクトを返して呼び出し側の分岐を不要にする（形状を揃えないと
// consumers が型分岐を強いられて事故率が上がる）。
function displayOnlyShortEntry(value, numerator, denominator) {
  return {
    value,
    ratio: ratioOf(numerator, denominator),
    ratioLabel: percentInt(numerator, denominator),
    warn: false,
  };
}

// 短行/短チャンクのバー幅として使う比率。Chrome拡張（work-page-injector.tsのshortMetricRow、
// widthPercent(short30, denominator)）はentry20/entry30を両方テキスト表示しつつ、バーは常に
// short30側の比率で描く（30側が20側を包含し重篤度の上限を示すため）。ShortRowもこれに合わせる。
// entry20は「20側の値と混同していないこと」をテストで示すためだけに残す（呼び出し側の意図が
// 読み取れるようシグネチャは両方受け取る）。使わないため _entry20 と命名する。
export function shortBarRatio(_entry20, entry30) {
  return entry30.ratio;
}

// カテゴリ別カード（地の文/セリフ/メタ/非文末）の内訳。地の文（chunkCountを持つ
// NarrativeCount）のときだけ短チャンク20/30を持つ（それ以外はundefined）。呼び出し側が
// 一貫した形のオブジェクトを扱えるよう、常に同じキー集合を持つ1つのオブジェクトリテラルを返す
// （条件付きでキーを後から生やすと呼び出し側の型推論が崩れるため避ける）。
export function categoryBreakdown(lineMetadata, categoryKey) {
  const count = lineMetadata[categoryKey];
  const isNarrative = count.chunkCount !== undefined;
  return {
    lineCount: amountEntry(count.lineCount, count.lineCount, lineMetadata.totalLines),
    charCount: amountEntry(count.charCount, count.charCount, lineMetadata.totalChars),
    // 短行14 は表示側で 14/20/30 の 3 数字を並べるためだけに露出する。docs/spec/line-metadata.md
    // 「表示」節「14 は warn 判定に参加させない」の契約を型レベルで守るため、shortEntry ではなく
    // displayOnlyShortEntry (warn 常に false) を経由する。app.js の ShortRow の合成
    // `warn = entry20.warn || entry30.warn` は 14 を明示的に除外しているが、entry14 側に
    // warn フラグが立ちうる状態自体を残さないほうが将来の consumer 誤読を防げる。
    short14: displayOnlyShortEntry(count.short14, count.short14, count.lineCount),
    short20: shortEntry(count.short20, count.short20, count.lineCount),
    short30: shortEntry(count.short30, count.short30, count.lineCount),
    avgCharsLabel: averageCharsLabel(count),
    chunkCount: isNarrative ? count.chunkCount : undefined,
    chunkCountLabel: isNarrative ? formatInt(count.chunkCount) : undefined,
    shortChunk14: isNarrative
      ? displayOnlyShortEntry(count.shortChunk14, count.shortChunk14, count.chunkCount)
      : undefined,
    shortChunk20: isNarrative
      ? shortEntry(count.shortChunk20, count.shortChunk20, count.chunkCount)
      : undefined,
    shortChunk30: isNarrative
      ? shortEntry(count.shortChunk30, count.shortChunk30, count.chunkCount)
      : undefined,
  };
}
