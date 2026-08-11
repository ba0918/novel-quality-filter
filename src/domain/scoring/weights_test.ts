import { assert, assertEquals } from "@std/assert";
import { combinePenaltyMultipliers, METRIC_CONFIGS, PENALTY_RULES } from "./weights.ts";

// 較正で確定した「地の文短行14 の過多」ペナルティが weights.ts に登録されていることを、
// 存在検査として固定する（挙動テストは mod_test.ts 側）。
Deno.test("weights: PENALTY_RULES に「地の文短行14 の過多」が登録され、evaluate ベースで multiplier 0.80", () => {
  // rev 20260811224443 で multiplier を 0.85 → 0.80 に微強化。narrative シグナルを penalty
  // 側で活用する家族 0 の設計。
  const rule = PENALTY_RULES.find((r) => r.label === "地の文短行14 の過多");
  assert(rule, "「地の文短行14 の過多」ペナルティが未登録");
  assertEquals(rule.penaltyMultiplier, 0.80);
  assert(rule.evaluate, "短行14 ペナルティは evaluate ベース（lineMetadata を要する）");
});

// 較正で「一文一段落の過多」は駄 8/10 に発火 = 強すぎる観測を得た。0.65 → 0.75 に緩めた変更を
// 明示的に固定する。将来のパラメータいじりでうっかり戻すのを検出できるようにする。
Deno.test("weights: 「一文一段落の過多」ペナルティは multiplier 0.75 に緩和されている", () => {
  const rule = PENALTY_RULES.find((r) => r.label === "一文一段落の過多");
  assert(rule, "「一文一段落の過多」ペナルティが見つからない");
  assertEquals(rule.penaltyMultiplier, 0.75);
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
  // 一文一段落過多(0.75) + 短行14過多(0.80) → 乗算なら 0.60、min-mult なら 0.75
  assertEquals(combinePenaltyMultipliers([0.75, 0.80]), 0.75);
  // 文長ばらつき不足(0.55) + 一文一段落過多(0.75) + 短行14過多(0.80) → 乗算 0.33、min-mult 0.55
  assertEquals(combinePenaltyMultipliers([0.55, 0.75, 0.80]), 0.55);
});

// 感情直接率・論理接続密度の weight 0 化。n=25 実測で符号逆の判別を持つと判明:
//   感情直接率 d=-1.33 (AUC=0.15) だが invert=true で weight 0.07 → 良側を叩いていた
//   論理接続密度 d=-0.71 (AUC=0.33) だが invert=true で weight 0.06 → 同じ
// 合計 0.13 を判別 4 指標 (sentenceLengthSD/paragraphLengthSD/paragraphTransitionEntropy/
// sentenceLengthBurstiness) へ均等按分 (各 +0.0325)。「按分を境界作品に合わせて手調整しない」の
// 判定原則に従い、機械的な等分で回避可能な過適合を退ける。base 合計 1.0 は維持する。
Deno.test("weights: 感情直接率・論理接続密度は weight 0 化されている (符号逆問題の除去)", () => {
  const emo = METRIC_CONFIGS.find((c) => c.key === "emotionDirectnessRatio");
  const log = METRIC_CONFIGS.find((c) => c.key === "logicalConnectiveDensity");
  assert(emo, "emotionDirectnessRatio が未登録");
  assert(log, "logicalConnectiveDensity が未登録");
  assertEquals(emo.weight, 0);
  assertEquals(log.weight, 0);
});

Deno.test("weights: 削減 weight 0.13 は判別 4 指標に均等按分されている (各 +0.0325)", () => {
  const expected: Record<string, number> = {
    sentenceLengthSD: 0.22 + 0.0325,
    paragraphLengthSD: 0.09 + 0.0325,
    paragraphTransitionEntropy: 0.08 + 0.0325,
    sentenceLengthBurstiness: 0.16 + 0.0325,
  };
  for (const [key, w] of Object.entries(expected)) {
    const c = METRIC_CONFIGS.find((x) => x.key === key);
    assert(c, `${key} が未登録`);
    // 浮動小数比較は誤差許容
    assert(
      Math.abs(c.weight - w) < 1e-9,
      `${key} の weight が ${w} でない (実際: ${c.weight})`,
    );
  }
});

Deno.test("weights: METRIC_CONFIGS の weight 合計は 1.0 (base 合計不変)", () => {
  const sum = METRIC_CONFIGS.reduce((s, c) => s + c.weight, 0);
  assert(Math.abs(sum - 1.0) < 1e-9, `weight 合計が 1.0 でない (実際: ${sum})`);
});
