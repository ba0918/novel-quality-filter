import { assertEquals } from "@std/assert";
import type { FetchedEpisode } from "./fetchers/kakuyomu.ts";
import { sampleEpisodes } from "./sampling.ts";

const FIXTURES_DIR = new URL("../../tests/fixtures/", import.meta.url).pathname;

function loadFixture(name: string): string {
  return Deno.readTextFileSync(`${FIXTURES_DIR}${name}`);
}

function episode(
  text: string,
  title = "第1話",
  url = "https://kakuyomu.jp/works/1/episodes/1",
): FetchedEpisode {
  return { episodeUrl: url, text, lines: [], episodeTitle: title, nextEpisodeUrl: null };
}

Deno.test("sampling: キャラ紹介開幕を次話で再採点する（開幕形式を保持）", async () => {
  const ep1 = episode(loadFixture("opening-char-intro-ep1.txt"));
  const ep2 = episode(
    loadFixture("opening-char-intro-ep2.txt"),
    "第1話",
    "https://kakuyomu.jp/works/1/episodes/2",
  );
  const nextSpy = (() => {
    let called = 0;
    return {
      fetch: (prev: FetchedEpisode): Promise<FetchedEpisode | null> => {
        called++;
        return Promise.resolve(prev === ep1 ? ep2 : null);
      },
      calls: () => called,
    };
  })();

  const sampling = await sampleEpisodes(ep1, nextSpy.fetch);

  assertEquals(sampling.openingType, "character-intro");
  assertEquals(sampling.sampledCount, 2);
  assertEquals(sampling.targetEpisodeIndex, 1);
  assertEquals(sampling.targetText, ep2.text);
  assertEquals(sampling.episodeUrl, ep2.episodeUrl);
  assertEquals(nextSpy.calls(), 1);
});

Deno.test("sampling: 取得失敗で終端し第1話にフォールバックする", async () => {
  const ep1 = episode(loadFixture("opening-char-intro-ep1.txt"));
  let called = 0;

  const sampling = await sampleEpisodes(ep1, () => {
    called++;
    throw new Error("episode not found");
  });

  assertEquals(sampling.openingType, "character-intro");
  assertEquals(sampling.sampledCount, 1);
  assertEquals(sampling.targetEpisodeIndex, 0);
  assertEquals(sampling.targetText, ep1.text);
  assertEquals(sampling.episodeUrl, ep1.episodeUrl);
  assertEquals(called, 1);
});

Deno.test("sampling: 次話なし（null）で終端し第1話にフォールバックする", async () => {
  const ep1 = episode(loadFixture("opening-bulletin-board-ep1.txt"));
  let called = 0;

  const sampling = await sampleEpisodes(ep1, () => {
    called++;
    return Promise.resolve(null);
  });

  assertEquals(sampling.openingType, "bulletin-board");
  assertEquals(sampling.sampledCount, 1);
  assertEquals(sampling.targetEpisodeIndex, 0);
  assertEquals(sampling.targetText, ep1.text);
  assertEquals(called, 1);
});

Deno.test("sampling: 全編掲示板は最大3話まで追加取得する", async () => {
  const bb = loadFixture("opening-bulletin-board-ep1.txt");
  const ep1 = episode(bb, "第1話", "https://kakuyomu.jp/works/1/episodes/1");
  let called = 0;

  const sampling = await sampleEpisodes(ep1, () => {
    called++;
    return Promise.resolve(
      episode(bb, "第1話", `https://kakuyomu.jp/works/1/episodes/${called + 1}`),
    );
  });

  assertEquals(called, 3);
  assertEquals(sampling.openingType, "bulletin-board");
  assertEquals(sampling.sampledCount, 4);
  assertEquals(sampling.targetEpisodeIndex, 0);
  assertEquals(sampling.targetText, bb);
  assertEquals(sampling.episodeUrl, ep1.episodeUrl);
});
