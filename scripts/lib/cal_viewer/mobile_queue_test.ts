import { assertEquals } from "@std/assert";
import { buildQueue, scoreOf } from "./mobile_queue.js";

function work(siteWorkId: string, score: number | undefined, labels?: string[]) {
  return {
    siteWorkId,
    title: `t-${siteWorkId}`,
    canonical: score === undefined ? undefined : { score },
    labels,
  };
}

Deno.test("buildQueue: ラベルが 1 件でも付いた作品は出さない (未ラベルだけを積む)", () => {
  const queue = buildQueue([
    work("k:1", 45),
    work("k:2", 45, ["良"]),
    work("k:3", 45, []),
    work("k:4", 45, ["対象外"]),
  ]);
  assertEquals(queue.map((w: { siteWorkId: string }) => w.siteWorkId), ["k:1", "k:3"]);
});

Deno.test("buildQueue: 境界帯 (スコア 45 に近い) 順に並べる", () => {
  const queue = buildQueue([
    work("k:80", 80),
    work("k:44", 44),
    work("k:20", 20),
    work("k:52", 52),
  ]);
  assertEquals(queue.map((w: { siteWorkId: string }) => w.siteWorkId), [
    "k:44",
    "k:52",
    "k:20",
    "k:80",
  ]);
});

Deno.test("buildQueue: 同距離は入力順を保つ (安定ソート)", () => {
  const queue = buildQueue([work("k:a", 40), work("k:b", 50), work("k:c", 40)]);
  assertEquals(queue.map((w: { siteWorkId: string }) => w.siteWorkId), ["k:a", "k:b", "k:c"]);
});

Deno.test("scoreOf: canonical 欠損は 0 として扱う (ソートで最後尾に回る)", () => {
  assertEquals(scoreOf(work("k:x", undefined)), 0);
  assertEquals(scoreOf(work("k:y", 42)), 42);
});
