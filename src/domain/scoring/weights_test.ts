import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { combinePenaltyMultipliers, METRIC_CONFIGS, PENALTY_RULES } from "./weights.ts";
import type { CategoryCount, LineMetadata, NarrativeCount, RawMetrics } from "../types.ts";

function makeCategory(): CategoryCount {
  return { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 };
}

function makeNarrative(overrides: Partial<NarrativeCount>): NarrativeCount {
  return {
    lineCount: 0,
    charCount: 0,
    short14: 0,
    short20: 0,
    short30: 0,
    chunkCount: 0,
    shortChunk14: 0,
    shortChunk20: 0,
    shortChunk30: 0,
    ...overrides,
  };
}

function makeLineMetadata(narrative: Partial<NarrativeCount>): LineMetadata {
  return {
    totalLines: 100,
    totalChars: 3000,
    blankCount: 0,
    separatorCount: 0,
    narrative: makeNarrative(narrative),
    dialogue: makeCategory(),
    meta: makeCategory(),
    nonTerminal: makeCategory(),
  };
}

const DUMMY_RAW = {} as RawMetrics; // grader は raw を参照しない rule のみ検証する

// 候補 D (rev 20260812190006): narrativeCharPerLine を weight 化。
// 「按分で他 weight を弄らない」方針のため base 合計は 1.0 を超え、表示は Σweight で
// rescale する (mod_test 側で挙動を固定)。
Deno.test("weights: narrativeCharPerLine が weight 0.15 で登録され lineMetadata から派生する", () => {
  const config = METRIC_CONFIGS.find((c) => c.key === "narrativeCharPerLine");
  assert(config, "narrativeCharPerLine が METRIC_CONFIGS に未登録");
  assertEquals(config.weight, 0.15);
  assertEquals(config.invert, false);
  assert(config.deriveRawValue, "raw[key] に無い派生指標なので deriveRawValue が必須");
  // 地の文 48 行 2400 字 → 50 字/行
  const lm = makeLineMetadata({ lineCount: 48, charCount: 2400 });
  assertEquals(config.deriveRawValue(DUMMY_RAW, lm), 50);
  // 地の文 0 行は測定不能 → 0 (寄与ゼロ側に倒す)
  assertEquals(config.deriveRawValue(DUMMY_RAW, makeLineMetadata({ lineCount: 0 })), 0);
  // lineMetadata なし (旧呼び出し) も 0
  assertEquals(config.deriveRawValue(DUMMY_RAW, undefined), 0);
});

Deno.test("weights: weight 合計は 1.15 (ncpl 追加分。表示層 rescale の前提値)", () => {
  const sum = METRIC_CONFIGS.reduce((s, c) => s + c.weight, 0);
  assertAlmostEquals(sum, 1.15, 1e-9);
});

// 候補 D: on/off (×0.80 一律) では 31% と 79% が同じ扱いになり、良側境界作品の巻き込みが
// 実測で主因だった。比率に比例する連続 grade に置き換える。
Deno.test("weights: 「地の文短行14 の過多」は grade 化され比率に応じた multiplier を返す", () => {
  const rule = PENALTY_RULES.find((r) => r.label === "地の文短行14 の過多");
  assert(rule, "「地の文短行14 の過多」ペナルティが未登録");
  assert(rule.graderMultiplier, "短行14 ペナルティは grader ベース");
  const grade = (short14: number) =>
    rule.graderMultiplier!(DUMMY_RAW, makeLineMetadata({ lineCount: 100, short14 }));
  assertEquals(grade(30), 1.0); // 境界 30% は非発火 (strict >)
  assertAlmostEquals(grade(31), 0.99, 1e-9); // 僅超過はほぼ無罪
  assertAlmostEquals(grade(50), 0.80, 1e-9); // 旧 on/off 相当点
  assertEquals(grade(79), 0.55); // floor で下げ止まる
  // 測定不能 (lineCount=0 / lineMetadata なし) は非発火
  assertEquals(rule.graderMultiplier!(DUMMY_RAW, makeLineMetadata({ lineCount: 0 })), 1.0);
  assertEquals(rule.graderMultiplier!(DUMMY_RAW, undefined), 1.0);
});

// 候補 D: 良側 (sspr>0.3 & SD<15 帯の良作) の巻き込みを減らすため 0.75 → 0.85 に緩和。
// 代償の駄側透過は holdout 検証込みで受容済み (experiments/20260812-holdout/results.md)。
Deno.test("weights: 「一文一段落の過多」ペナルティは multiplier 0.85 に緩和されている", () => {
  const rule = PENALTY_RULES.find((r) => r.label === "一文一段落の過多");
  assert(rule, "「一文一段落の過多」ペナルティが見つからない");
  assertEquals(rule.penaltyMultiplier, 0.85);
});

// 案 A (min-mult 合成): n=25 実測で「複数 penalty rule の乗算合成が良側境界作品の主犯」と判明。
// 例: 良「スキルレベル」base 56.7 が一文一段落過多(0.75)+短行14過多(0.80)の乗算(0.60)で 34.0 に潰れた。
// 発火した rule 群のうち「最も強い penalty (最小 multiplier)」1 個だけを適用する min-mult 合成に切り替え、
// 二重発火による過剰減点を防ぐ。単発発火時は乗算/最小どちらも同値なので既存駄側の判別は温存する。
Deno.test("weights: combinePenaltyMultipliers は発火なし時 1.0 を返す", () => {
  assertEquals(combinePenaltyMultipliers([]), 1.0);
});

Deno.test("weights: combinePenaltyMultipliers は単発発火時その multiplier をそのまま返す", () => {
  assertEquals(combinePenaltyMultipliers([0.75]), 0.75);
  assertEquals(combinePenaltyMultipliers([0.55]), 0.55);
});

Deno.test("weights: combinePenaltyMultipliers は複数発火時 min(multipliers) を返す (min-mult 合成)", () => {
  // 一文一段落過多(0.85) + 短行14 grade(0.90) → 乗算なら 0.765、min-mult なら 0.85
  assertEquals(combinePenaltyMultipliers([0.85, 0.90]), 0.85);
  // 文長ばらつき不足(0.55) + 一文一段落過多(0.85) + 短行14 grade(0.80) → 乗算 0.374、min-mult 0.55
  assertEquals(combinePenaltyMultipliers([0.55, 0.85, 0.80]), 0.55);
});
