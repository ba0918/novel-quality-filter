import { assertEquals } from "@std/assert";
import type { RawMetrics } from "../../src/domain/types.ts";
import { calculateScore } from "../../src/domain/scoring/mod.ts";
import { METRIC_CONFIGS, PENALTY_RULES } from "../../src/domain/scoring/weights.ts";
import { scoreExperiment, scoreWithConfig } from "./score_experiment.ts";

// 代表的な生指標（高比率×低SD＝複合ペナ発火帯）
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

Deno.test("scoreWithConfig: production の重み・ペナルティを渡すと calculateScore と一致（研究エンジンの baseline 忠実）", () => {
  for (
    const r of [
      raw(),
      raw({ singleSentParaRatio: 0.3, sentenceLengthSD: 25 }),
      raw({ sentenceLengthSD: 8, sentenceLengthBurstiness: 2 }),
    ]
  ) {
    assertEquals(scoreWithConfig(r, METRIC_CONFIGS, PENALTY_RULES), calculateScore(r).score);
  }
});

Deno.test("scoreWithConfig: 正規化の変更はペナルティ発火判定にも波及する（gate スコア研究の本番挙動）", () => {
  // 高比率0.85×低SD12 は複合ペナ発火帯。M1 正規化に floor を焼くと normalizedValue が上がり
  // 条件 <0.30 が充足不能→一文一段落ルールが不発になる（＝表示用の contribution-floor と違い、
  // gate 研究では正規化変更が発火に波及するのが正しい）。それを実挙動として固定する。
  const r = raw({ singleSentParaRatio: 0.85, sentenceLengthSD: 12 });
  const flooredCfgs = METRIC_CONFIGS.map((c) =>
    c.key === "singleSentParaRatio"
      ? { ...c, normalize: (raw: number) => Math.min(Math.max(1 - Math.min(raw, 1), 0.35), 1) }
      : c
  );
  const withFloorNorm = scoreWithConfig(r, flooredCfgs, PENALTY_RULES);
  const baseline = scoreWithConfig(r, METRIC_CONFIGS, PENALTY_RULES);
  // 発火が消えるので baseline/0.65 付近まで跳ねる（＝波及している証拠）
  if (withFloorNorm < baseline / 0.65 * 0.9) {
    throw new Error(
      `正規化変更がペナルティに波及していない: baseline=${baseline} floored=${withFloorNorm}`,
    );
  }
});

Deno.test("scoreExperiment: 上書きなしは production calculateScore と一致（baseline 忠実）", () => {
  for (
    const r of [
      raw(),
      raw({ singleSentParaRatio: 0.3, sentenceLengthSD: 25 }),
      raw({ sentenceLengthSD: 8, sentenceLengthBurstiness: 2 }),
    ]
  ) {
    assertEquals(scoreExperiment(r, {}), calculateScore(r).score);
  }
});

Deno.test("scoreExperiment: M1 floor は contribution だけ持ち上げ、複合ペナ発火は据え置く（実装トラップ回避）", () => {
  // 高比率0.85×低SD12 は複合ペナ発火帯。floor を入れても発火は消えず、base だけ上がる。
  const r = raw({ singleSentParaRatio: 0.85, sentenceLengthSD: 12 });
  const baseline = scoreExperiment(r, {});
  const floored = scoreExperiment(r, { m1ContribFloor: 0.35 });
  // floor で上がるが、複合ペナ×0.65 が生きているので跳ね上がりは限定的（base差×0.65）。
  // 発火が消えていれば floored は baseline/0.65 近くまで跳ねてしまう＝それを禁じる。
  const jumpIfPenaltyLost = baseline / 0.65;
  if (floored >= jumpIfPenaltyLost) {
    throw new Error(
      `複合ペナが消えている疑い: baseline=${baseline} floored=${floored} (>=${
        jumpIfPenaltyLost.toFixed(1)
      })`,
    );
  }
  assertEquals(floored > baseline, true);
});
