import { assert, assertEquals } from "@std/assert";
import type { LineMetadata, RawMetrics } from "../types.ts";
import { CALIBRATION_CONTROL_POINTS, METRIC_CONFIGS, PENALTY_RULES } from "./weights.ts";
import { EXPERIMENT_METRIC_CONFIGS, EXPERIMENT_PENALTY_RULES } from "./weights_experiment.ts";
import {
  CANONICAL_FORMULA,
  EXPERIMENT_FORMULA,
  scoreResultFromMetrics,
} from "../../../scripts/lib/cal_evaluate.ts";
import { makeCalibration } from "./calibration.ts";

function raw(overrides: Partial<RawMetrics> = {}): RawMetrics {
  return {
    charCount: 3000,
    sentenceCount: 60,
    sentenceLengthSD: 12,
    singleSentParaRatio: 0.85,
    paragraphLengthSD: 20,
    separatorCount: 0,
    separatorFrequency: 0,
    ttr: 0.5,
    dialogueCount: 20,
    dialogueEndingVariety: 0.5,
    descriptionDensitySD: 0.03,
    taigendomeEntropy: 1,
    emotionDirectnessRatio: 0.04,
    logicalConnectiveDensity: 0.1,
    paragraphTransitionEntropy: 1,
    sentenceLengthBurstiness: 5,
    ...overrides,
  };
}

function lineMeta(overrides: Partial<LineMetadata["narrative"]> = {}): LineMetadata {
  return {
    totalLines: 100,
    totalChars: 3000,
    blankCount: 20,
    separatorCount: 0,
    narrative: {
      lineCount: 50,
      charCount: 2000,
      short14: 10,
      short20: 20,
      short30: 30,
      chunkCount: 50,
      shortChunk14: 12,
      shortChunk20: 22,
      shortChunk30: 32,
      ...overrides,
    },
    dialogue: { lineCount: 20, charCount: 500, short14: 5, short20: 8, short30: 12 },
    meta: { lineCount: 0, charCount: 0, short14: 0, short20: 0, short30: 0 },
    nonTerminal: { lineCount: 10, charCount: 500, short14: 2, short20: 4, short30: 6 },
  };
}

// 家族 0 デルタ導入後の差分アサーション群。
// 「差分ゼロ」の初期ベースラインは失効し、代わりに以下の 4 差分を機構化する:
// (1) narrativeShort14Ratio 追加 (deriveRawValue で lineMetadata から派生、weight 0.08)
// (2) dialogueEndingVariety weight を 0 に (家族 2 で正式廃止予定、家族 0 で weight 移動)
// (3) PENALTY_RULES から「地の文短行14 の過多」を削除 (narrativeShort14Ratio と二重計上回避)
// (4) 「一文一段落の過多」multiplier を 0.75 → 0.70 (短行14 penalty 廃止で緩和根拠失効)
Deno.test("weights_experiment[家族0]: 実験式は正本キー ∪ {narrativeShort14Ratio} の集合", () => {
  assertEquals(
    EXPERIMENT_METRIC_CONFIGS.map((c) => c.key).sort(),
    [...METRIC_CONFIGS.map((c) => c.key), "narrativeShort14Ratio"].sort(),
  );
});

Deno.test("weights_experiment[家族0]: dialogueEndingVariety の weight は 0 に落ちている", () => {
  const canonical = METRIC_CONFIGS.find((c) => c.key === "dialogueEndingVariety");
  const experiment = EXPERIMENT_METRIC_CONFIGS.find((c) => c.key === "dialogueEndingVariety");
  assertEquals(canonical?.weight, 0.08, "canonical は 0.08 のまま");
  assertEquals(
    experiment?.weight,
    0,
    "実験側は 0 に落ちる (家族 0 で weight 移動、家族 2 で正式廃止)",
  );
});

Deno.test("weights_experiment[家族0]: narrativeShort14Ratio が weight 0.08 で追加、deriveRawValue 定義済み", () => {
  const config = EXPERIMENT_METRIC_CONFIGS.find((c) => c.key === "narrativeShort14Ratio");
  assert(config, "narrativeShort14Ratio エントリが存在する");
  assertEquals(config.weight, 0.08);
  assertEquals(config.invert, true);
  assert(config.deriveRawValue, "deriveRawValue が定義されている (lineMetadata から派生)");
});

Deno.test("weights_experiment[家族0]: narrativeShort14Ratio の deriveRawValue が正しく計算する", () => {
  const config = EXPERIMENT_METRIC_CONFIGS.find((c) => c.key === "narrativeShort14Ratio");
  assert(config?.deriveRawValue);
  // 通常ケース: short14 / lineCount = 10 / 50 = 0.2
  assertEquals(config.deriveRawValue(raw(), lineMeta()), 0.2);
  // 別ケース: short14 / lineCount = 30 / 50 = 0.6 (駄側寄り)
  assertEquals(config.deriveRawValue(raw(), lineMeta({ short14: 30 })), 0.6);
  // エッジ: lineCount === 0 は測定不能で中立値 0.5
  assertEquals(
    config.deriveRawValue(raw(), lineMeta({ lineCount: 0, charCount: 0 })),
    0.5,
  );
  // エッジ: lineMetadata なしは中立値 0.5
  assertEquals(config.deriveRawValue(raw(), undefined), 0.5);
});

Deno.test("weights_experiment[家族0]: PENALTY_RULES から「地の文短行14 の過多」が削除されている", () => {
  const canonicalHasShort14 = PENALTY_RULES.some((r) => r.label === "地の文短行14 の過多");
  const experimentHasShort14 = EXPERIMENT_PENALTY_RULES.some((r) =>
    r.label === "地の文短行14 の過多"
  );
  assert(canonicalHasShort14, "canonical には残っている");
  assert(
    !experimentHasShort14,
    "実験側からは削除されている (narrativeShort14Ratio と二重計上回避)",
  );
});

Deno.test("weights_experiment[家族0]: 一文一段落の過多 multiplier は canonical 0.75 → experiment 0.70", () => {
  const canonical = PENALTY_RULES.find((r) => r.label === "一文一段落の過多");
  const experiment = EXPERIMENT_PENALTY_RULES.find((r) => r.label === "一文一段落の過多");
  assertEquals(canonical?.penaltyMultiplier, 0.75);
  assertEquals(experiment?.penaltyMultiplier, 0.70);
});

// 家族 0 デルタ導入後、canonical と experiment の共有指標 (12 指標) は同一 normalize/invert/
// flag を維持する (narrativeShort14Ratio のみ実験専用の新規追加)。デルタが「意図せず既存指標
// を汚す」ことを機構的に禁じる。
Deno.test("weights_experiment[家族0]: 共有 12 指標の normalize/invert/flag は canonical と一致 (weight は例外)", () => {
  const experimentByKey = new Map(EXPERIMENT_METRIC_CONFIGS.map((c) => [c.key, c]));
  for (const canonical of METRIC_CONFIGS) {
    const experiment = experimentByKey.get(canonical.key);
    assert(experiment, `${canonical.key} が実験式にも存在する`);
    assertEquals(experiment.label, canonical.label, `${canonical.key} label 一致`);
    assertEquals(experiment.invert, canonical.invert, `${canonical.key} invert 一致`);
    assertEquals(
      experiment.flagThreshold,
      canonical.flagThreshold,
      `${canonical.key} flagThreshold 一致`,
    );
    // normalize 関数の同一性は 6 点サンプリングで代替 (0/境界/中央/大値/負/整数)。
    const samples = [0, 0.01, 0.3, 0.7, 1, 12];
    assertEquals(
      samples.map((x) => experiment.normalize(x)),
      samples.map((x) => canonical.normalize(x)),
      `${canonical.key} normalize 一致`,
    );
    // weight は dialogueEndingVariety のみ差分あり (canonical 0.08 → experiment 0)、他は一致
    if (canonical.key === "dialogueEndingVariety") {
      assertEquals(experiment.weight, 0);
    } else {
      assertEquals(experiment.weight, canonical.weight, `${canonical.key} weight 一致`);
    }
  }
});

Deno.test("weights_experiment[家族0]: 実験式スコアは canonical と有意に差が出る (デルタが効いていることの確認)", () => {
  // dialogueEndingVariety の weight を落とし、narrativeShort14Ratio を追加、penalty を
  // 変えたので、同じ rawMetrics でも canonical と experiment のスコアは一般に異なる。
  const samples: Array<{ r: RawMetrics; lm: LineMetadata }> = [
    { r: raw(), lm: lineMeta() },
    { r: raw({ singleSentParaRatio: 0.3, sentenceLengthSD: 25 }), lm: lineMeta({ short14: 5 }) },
    { r: raw({ sentenceLengthSD: 8, sentenceLengthBurstiness: 2 }), lm: lineMeta({ short14: 25 }) },
  ];
  let differ = 0;
  for (const { r, lm } of samples) {
    const c = scoreResultFromMetrics(r, CANONICAL_FORMULA, lm).score;
    const e = scoreResultFromMetrics(r, EXPERIMENT_FORMULA, lm).score;
    if (c !== e) differ++;
  }
  assert(differ > 0, "デルタが効いていれば少なくとも 1 サンプルでスコアが異なるはず");
});

Deno.test("weights_experiment: 較正カーブは制御点 CALIBRATION_CONTROL_POINTS を通し不変量として保つ", () => {
  // 制御点は canonical / experiment で共有。指標側の実験と較正側の実験を分離する契約。
  const f = makeCalibration(CALIBRATION_CONTROL_POINTS);
  assertEquals(f(40), 40);
  assertEquals(f(0), 0);
  assertEquals(f(100), 100);
});

Deno.test("weights_experiment: 実験式を採点で使っても正本 weights.ts の値は不変 (C1)", () => {
  const snapshot = (configs: MetricConfig[]) =>
    JSON.stringify(configs.map((c) => ({
      key: c.key,
      weight: c.weight,
      invert: c.invert,
      flagThreshold: c.flagThreshold,
    })));
  const canonicalSnapshot = snapshot(METRIC_CONFIGS);
  const penaltySnapshot = JSON.stringify(PENALTY_RULES);

  // 実験式を実際に採点へ流す (scoreResultFromMetrics 経由で narrativeShort14Ratio の
  // deriveRawValue も呼ばれる = lineMetadata が必要)。
  const r = raw();
  const lm = lineMeta();
  scoreResultFromMetrics(r, EXPERIMENT_FORMULA, lm);

  assertEquals(snapshot(METRIC_CONFIGS), canonicalSnapshot, "canonical METRIC_CONFIGS 不変");
  assertEquals(JSON.stringify(PENALTY_RULES), penaltySnapshot, "canonical PENALTY_RULES 不変");
});

type MetricConfig = typeof METRIC_CONFIGS[number];
