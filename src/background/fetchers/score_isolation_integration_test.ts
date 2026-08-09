import { assertEquals } from "@std/assert";
import { initTokenizer, tokenize } from "../../domain/tokenizer/mod.ts";
import { analyzeAll } from "../../domain/analyzer/mod.ts";
import { calculateScore } from "../../domain/scoring/mod.ts";
import { aggregateLineMetadata } from "../../domain/analyzer/line_metadata.ts";
import { extractLinesFromHtml, extractTextFromHtml } from "./kakuyomu.ts";

// RawMetrics（flat scoring 入力）が持つべき16フィールド。行メタデータ由来のキーが
// 混入していないことを機械的に固定するための期待集合。
const RAW_METRICS_KEYS = [
  "charCount",
  "sentenceCount",
  "sentenceLengthSD",
  "singleSentParaRatio",
  "paragraphLengthSD",
  "separatorCount",
  "separatorFrequency",
  "ttr",
  "dialogueCount",
  "dialogueEndingVariety",
  "descriptionDensitySD",
  "taigendomeEntropy",
  "emotionDirectnessRatio",
  "logicalConnectiveDensity",
  "paragraphTransitionEntropy",
  "sentenceLengthBurstiness",
].sort();

// 数値文字参照を含む実本文 HTML。共有デコーダ（decodeHtmlEntities）を通る経路で
// flat scoring と行メタデータ集計が互いに干渉しないことを検証するため、
// extractTextFromHtml / extractLinesFromHtml の両方がこの HTML を復号する。
const EPISODE_HTML = [
  '<div class="widget-episodeBody">',
  "<p>静かな朝だった。&#x3010;HP&#x3011;の表示が視界の隅で明滅している。</p>",
  "<p>彼女は窓の外を眺め、ゆっくりと息を吐いた。遠くで鐘が鳴っている。</p>",
  '<p class="blank"><br /></p>',
  "<p>「行こう」と彼は言った。返事はなかったが、足音がついてきた。</p>",
  "<p>雨が降り始める。街の輪郭が滲み、灯りだけが揺れていた。</p>",
  "</div>",
].join("\n");

Deno.test({
  name: "スコア非干渉（統合）: 行メタデータ経路はflat scoringの入力にも出力にも混入しない",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await initTokenizer();

    const text = extractTextFromHtml(EPISODE_HTML);

    const raw = analyzeAll(text, tokenize(text), tokenize);
    const result = calculateScore(raw);

    // (a) スコア結果に行メタデータフィールドが現れない（添付は score-handler の責務）。
    assertEquals("lineMetadata" in result, false);
    // (b) RawMetrics に行メタデータ由来のフィールドが無い（16フィールドちょうど）。
    assertEquals(Object.keys(raw).sort(), RAW_METRICS_KEYS);
  },
});

Deno.test({
  name:
    "スコア非干渉（統合）: aggregateLineMetadata の呼び出しは analyzeAll/calculateScore の出力を変えない",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await initTokenizer();

    const text = extractTextFromHtml(EPISODE_HTML);
    const lines = extractLinesFromHtml(EPISODE_HTML);

    const rawBefore = analyzeAll(text, tokenize(text), tokenize);
    const scoreBefore = calculateScore(rawBefore);

    // 別経路の行メタデータ集計を挟む。共有状態を汚さないなら以降の再計算は不変。
    aggregateLineMetadata(lines);

    const rawAfter = analyzeAll(text, tokenize(text), tokenize);
    const scoreAfter = calculateScore(rawAfter);

    assertEquals(rawAfter, rawBefore);
    assertEquals(scoreAfter, scoreBefore);
  },
});
