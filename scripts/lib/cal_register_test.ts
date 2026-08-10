import { assertEquals, assertThrows } from "@std/assert";
import type { RawMetrics } from "../../src/domain/types.ts";
import type { DatasetRecord } from "./dataset.ts";
import { CANONICAL_FORMULA, scoreResultFromMetrics } from "./cal_evaluate.ts";
import { parseRegisterArgs, registerResultOf, resolveWorkId } from "./cal_register.ts";

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

function record(score: number, rawMetrics: RawMetrics): DatasetRecord {
  return {
    workId: "1",
    url: "https://kakuyomu.jp/works/1",
    title: "作品1",
    author: "著者",
    reviewCount: 0,
    totalReviewPoint: 0,
    totalCharacterCount: 0,
    openingType: "normal",
    sampledCount: 1,
    episodeUrl: "https://kakuyomu.jp/works/1/episodes/1",
    score,
    rawMetrics,
    blankLineRatio: 0,
    tags: [],
    crawledAt: "2026-08-10T00:00:00.000Z",
    siteWorkId: "kakuyomu:1",
  };
}

Deno.test("resolveWorkId: 数値IDと作品URLを作品IDへ正規化する", () => {
  assertEquals(resolveWorkId("1234567"), "1234567");
  assertEquals(resolveWorkId("https://kakuyomu.jp/works/1234567"), "1234567");
  assertEquals(resolveWorkId("https://kakuyomu.jp/works/1234567/episodes/99"), "1234567");
});

Deno.test("resolveWorkId: 数値にならない入力を弾く（パス汚染防止のガード）", () => {
  assertThrows(() => resolveWorkId("../etc/passwd"));
  assertThrows(() => resolveWorkId("abc"));
});

Deno.test("parseRegisterArgs: ターゲットとフラグを分離する", () => {
  const opts = parseRegisterArgs([
    "111",
    "--tag",
    "自然分布",
    "222",
    "--interval",
    "3000",
    "--recapture",
  ]);
  assertEquals(opts.targets, ["111", "222"]);
  assertEquals(opts.tags, ["自然分布"]);
  assertEquals(opts.interval, 3000);
  assertEquals(opts.recapture, true);
});

Deno.test("parseRegisterArgs: 既定値はフラグ無指定で埋まる", () => {
  const opts = parseRegisterArgs(["111"]);
  assertEquals(opts.targets, ["111"]);
  assertEquals(opts.tags, []);
  assertEquals(opts.recapture, false);
  assertEquals(opts.out, ".agents/runtime/dataset.jsonl");
});

Deno.test("registerResultOf: 表示スコアは保存 score でなく正本式の再計算値", () => {
  const r = raw();
  const rec = record(999, r); // 保存 score は毒値
  const result = registerResultOf(rec, "cap-1");
  assertEquals(result.score, scoreResultFromMetrics(r, CANONICAL_FORMULA).score);
  assertEquals(result.score === 999, false);
  assertEquals(result.captureId, "cap-1");
  assertEquals(result.title, "作品1");
});
