// list_filter.js（サイドバーの検索・ラベルフィルタ・用途特化フィルタ・ソート）の単体テスト。
// cal.json の work オブジェクトを模した最小フィクスチャで純関数の振る舞いを検証する。

import { assertEquals } from "@std/assert";
import { applyFilters, hasFlagged, labelCounts, labelsOf } from "./list_filter.js";

// deno-lint-ignore no-explicit-any
function work(overrides: Record<string, any>): any {
  return {
    siteWorkId: overrides.title ?? "w",
    title: "作品",
    author: "作者",
    labels: [],
    diff: 0,
    canonical: { score: 50, metrics: [] },
    experiment: { score: 50, metrics: [] },
    ...overrides,
  };
}

function metric(flagged: boolean) {
  return {
    key: "k",
    label: "l",
    rawValue: 0,
    normalizedValue: 0,
    weight: 0,
    contribution: 0,
    flagged,
    reason: "",
  };
}

Deno.test("applyFilters: 検索がタイトルの部分一致（大文字小文字無視）で絞る", () => {
  const works = [
    work({ title: "崩界のオブリテレーター" }),
    work({ title: "Ordinary World" }),
  ];
  const result = applyFilters(works, { query: "ordinary" });
  assertEquals(result.map((w: { title: string }) => w.title), ["Ordinary World"]);
});

Deno.test("applyFilters: 検索が作者名の部分一致でも絞る", () => {
  const works = [
    work({ title: "A", author: "エチゼン鏡介" }),
    work({ title: "B", author: "はぐれうさぎ" }),
  ];
  const result = applyFilters(works, { query: "うさぎ" });
  assertEquals(result.map((w: { title: string }) => w.title), ["B"]);
});

Deno.test("applyFilters: 検索クエリが空なら絞り込まない", () => {
  const works = [work({ title: "A" }), work({ title: "B" })];
  const result = applyFilters(works, { query: "" });
  assertEquals(result.length, 2);
});

Deno.test("applyFilters: ラベルフィルタは複数選択でOR結合される", () => {
  const works = [
    work({ title: "良作", labels: ["良"] }),
    work({ title: "ゴミ作", labels: ["ゴミ"] }),
    work({ title: "対象外作", labels: ["対象外"] }),
  ];
  const result = applyFilters(works, { labels: ["良", "ゴミ"] });
  assertEquals(result.map((w: { title: string }) => w.title).sort(), ["ゴミ作", "良作"]);
});

Deno.test("applyFilters: 「未」は labels が空配列の作品に絞る", () => {
  const works = [
    work({ title: "未ラベル", labels: [] }),
    work({ title: "良ラベル", labels: ["良"] }),
  ];
  const result = applyFilters(works, { labels: ["未"] });
  assertEquals(result.map((w: { title: string }) => w.title), ["未ラベル"]);
});

Deno.test("applyFilters: 「未」は labels が未定義の作品にも絞る", () => {
  const withoutLabels = work({ title: "未定義ラベル" });
  delete withoutLabels.labels;
  const works = [withoutLabels, work({ title: "良ラベル", labels: ["良"] })];
  const result = applyFilters(works, { labels: ["未"] });
  assertEquals(result.map((w: { title: string }) => w.title), ["未定義ラベル"]);
});

Deno.test("applyFilters: ラベル未選択（空配列）は絞り込まない", () => {
  const works = [work({ title: "A", labels: ["良"] }), work({ title: "B", labels: [] })];
  const result = applyFilters(works, { labels: [] });
  assertEquals(result.length, 2);
});

Deno.test("hasFlagged: canonical か experiment のいずれかで1つ以上 flagged なら true", () => {
  const flaggedInCanonical = work({ canonical: { score: 1, metrics: [metric(true)] } });
  const flaggedInExperiment = work({ experiment: { score: 1, metrics: [metric(true)] } });
  const notFlagged = work({});
  assertEquals(hasFlagged(flaggedInCanonical), true);
  assertEquals(hasFlagged(flaggedInExperiment), true);
  assertEquals(hasFlagged(notFlagged), false);
});

Deno.test("applyFilters: 「要注意」は canonical/experiment のいずれかで flagged な作品に絞る", () => {
  const works = [
    work({ title: "要注意", experiment: { score: 1, metrics: [metric(true)] } }),
    work({ title: "非対象" }),
  ];
  const result = applyFilters(works, { warn: true });
  assertEquals(result.map((w: { title: string }) => w.title), ["要注意"]);
});

Deno.test("applyFilters: 「実験影響大」は |diff| >= 3 の作品に絞る", () => {
  const works = [
    work({ title: "大差プラス", diff: 3 }),
    work({ title: "大差マイナス", diff: -3.5 }),
    work({ title: "小差", diff: 1 }),
  ];
  const result = applyFilters(works, { bigDiff: true });
  assertEquals(result.map((w: { title: string }) => w.title).sort(), [
    "大差プラス",
    "大差マイナス",
  ]);
});

Deno.test("applyFilters: 複数条件（ラベル「良」× 要注意）はANDで合成される", () => {
  const works = [
    work({
      title: "良かつ要注意",
      labels: ["良"],
      experiment: { score: 1, metrics: [metric(true)] },
    }),
    work({ title: "良のみ", labels: ["良"] }),
    work({ title: "要注意のみ", experiment: { score: 1, metrics: [metric(true)] } }),
  ];
  const result = applyFilters(works, { labels: ["良"], warn: true });
  assertEquals(result.map((w: { title: string }) => w.title), ["良かつ要注意"]);
});

Deno.test("applyFilters: sort=diff-desc（既定）はΔの降順に並ぶ", () => {
  const works = [
    work({ title: "A", diff: 1 }),
    work({ title: "B", diff: 3 }),
    work({
      title: "C",
      diff: -2,
    }),
  ];
  const result = applyFilters(works, { sort: "diff-desc" });
  assertEquals(result.map((w: { title: string }) => w.title), ["B", "A", "C"]);
});

Deno.test("applyFilters: sort=canonical-desc は正本スコアの降順に並ぶ", () => {
  const works = [
    work({ title: "A", canonical: { score: 40, metrics: [] } }),
    work({ title: "B", canonical: { score: 60, metrics: [] } }),
  ];
  const result = applyFilters(works, { sort: "canonical-desc" });
  assertEquals(result.map((w: { title: string }) => w.title), ["B", "A"]);
});

Deno.test("applyFilters: sort=experiment-desc は実験スコアの降順に並ぶ", () => {
  const works = [
    work({ title: "A", experiment: { score: 40, metrics: [] } }),
    work({ title: "B", experiment: { score: 60, metrics: [] } }),
  ];
  const result = applyFilters(works, { sort: "experiment-desc" });
  assertEquals(result.map((w: { title: string }) => w.title), ["B", "A"]);
});

Deno.test("applyFilters: sort=label はラベル優先度（良→ゴミ→対象外→未）順に並ぶ", () => {
  const works = [
    work({ title: "未", labels: [] }),
    work({ title: "対象外", labels: ["対象外"] }),
    work({ title: "良", labels: ["良"] }),
    work({ title: "ゴミ", labels: ["ゴミ"] }),
  ];
  const result = applyFilters(works, { sort: "label" });
  assertEquals(result.map((w: { title: string }) => w.title), ["良", "ゴミ", "対象外", "未"]);
});

Deno.test("applyFilters: sort=title はタイトルの辞書順に並ぶ", () => {
  const works = [work({ title: "ろ" }), work({ title: "あ" }), work({ title: "い" })];
  const result = applyFilters(works, { sort: "title" });
  assertEquals(result.map((w: { title: string }) => w.title), ["あ", "い", "ろ"]);
});

Deno.test("labelsOf: labels未定義の作品は空配列を返す", () => {
  const withoutLabels = work({ title: "未定義ラベル" });
  delete withoutLabels.labels;
  assertEquals(labelsOf(withoutLabels), []);
});

Deno.test("labelsOf: labelsが空配列の作品はそのまま空配列を返す", () => {
  assertEquals(labelsOf(work({ labels: [] })), []);
});

Deno.test("labelsOf: labelsが値を持つ作品はそのまま返す", () => {
  assertEquals(labelsOf(work({ labels: ["良", "対象外"] })), ["良", "対象外"]);
});

Deno.test("applyFilters: labelsが未定義の作品を具体ラベル（良/ゴミ/対象外）で絞ってもエラーにならず除外される", () => {
  const withoutLabels = work({ title: "未定義ラベル" });
  delete withoutLabels.labels;
  const works = [withoutLabels, work({ title: "良ラベル", labels: ["良"] })];
  const result = applyFilters(works, { labels: ["良"] });
  assertEquals(result.map((w: { title: string }) => w.title), ["良ラベル"]);
});

Deno.test("applyFilters: sort=label で labels が未定義の作品はエラーにならず「未」扱い（末尾）になる", () => {
  const withoutLabels = work({ title: "未定義ラベル" });
  delete withoutLabels.labels;
  const works = [withoutLabels, work({ title: "良ラベル", labels: ["良"] })];
  const result = applyFilters(works, { sort: "label" });
  assertEquals(result.map((w: { title: string }) => w.title), ["良ラベル", "未定義ラベル"]);
});

Deno.test("labelCounts: 良/ゴミ/対象外/未の件数を作品全体から数える", () => {
  const works = [
    work({ labels: ["良"] }),
    work({ labels: ["良"] }),
    work({ labels: ["ゴミ"] }),
    work({ labels: ["対象外"] }),
    work({ labels: [] }),
  ];
  assertEquals(labelCounts(works), { "良": 2, "ゴミ": 1, "対象外": 1, "未": 1 });
});
