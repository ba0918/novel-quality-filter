import { assertEquals } from "@std/assert";
import {
  DEFAULT_SEED_TAGS,
  executeHarvest,
  harvestCandidates,
  type HarvestDeps,
  listingUrl,
  parseHarvestArgs,
} from "./cal_harvest.ts";

function depsWith(over: Partial<HarvestDeps>): HarvestDeps {
  return {
    httpGet: () => Promise.resolve(""),
    sleep: () => Promise.resolve(),
    random: () => 0,
    loadSeen: () => Promise.resolve(new Set<string>()),
    register: () => Promise.resolve(0),
    ...over,
  };
}

Deno.test("parseHarvestArgs: 引数なしは既定シードタグ・max 30・1頁・登録あり", () => {
  const opts = parseHarvestArgs([]);
  assertEquals(opts.tags, DEFAULT_SEED_TAGS);
  assertEquals(opts.max, 30);
  assertEquals(opts.pages, 1);
  assertEquals(opts.dryRun, false);
  assertEquals(opts.registerTags, ["auto-harvest"]);
});

Deno.test("parseHarvestArgs: 位置引数タグとフラグを読み取る", () => {
  const opts = parseHarvestArgs(
    ["曇らせ", "--max", "10", "--pages", "2", "--dry-run", "--tag", "batch2", "配信"],
  );
  assertEquals(opts.tags, ["曇らせ", "配信"]);
  assertEquals(opts.max, 10);
  assertEquals(opts.pages, 2);
  assertEquals(opts.dryRun, true);
  assertEquals(opts.registerTags, ["batch2"]);
});

Deno.test("listingUrl: タグを URL エンコードし更新順・頁番号を付ける", () => {
  assertEquals(
    listingUrl("異世界", 2),
    "https://kakuyomu.jp/tags/%E7%95%B0%E4%B8%96%E7%95%8C?order=last_episode_published_at&page=2",
  );
});

Deno.test("harvestCandidates: 既収集を除外しタグ横断の重複を初出にまとめる", async () => {
  const pages: Record<string, string> = {
    [listingUrl("tagA", 1)]: `<a href="/works/111"></a><a href="/works/222"></a>`,
    [listingUrl("tagB", 1)]: `<a href="/works/222"></a><a href="/works/333"></a>`,
  };
  const got = await harvestCandidates(
    { tags: ["tagA", "tagB"], pages: 1, max: 10, intervalMs: 0 },
    new Set(["111"]),
    depsWith({ httpGet: (url) => Promise.resolve(pages[url] ?? "") }),
  );
  // random=0 固定の Fisher-Yates は [222, 333] → [333, 222]
  assertEquals(got.sort(), ["222", "333"]);
});

Deno.test("harvestCandidates: max 件に絞り、結果は候補の部分集合", async () => {
  const html = ["111", "222", "333", "444", "555"]
    .map((id) => `<a href="/works/${id}"></a>`).join("");
  const got = await harvestCandidates(
    { tags: ["t"], pages: 1, max: 2, intervalMs: 0 },
    new Set(),
    depsWith({ httpGet: () => Promise.resolve(html) }),
  );
  assertEquals(got.length, 2);
  assertEquals(new Set(got).size, 2);
  for (const id of got) assertEquals(["111", "222", "333", "444", "555"].includes(id), true);
});

Deno.test("harvestCandidates: 一覧取得の失敗はそのタグだけスキップして続行する", async () => {
  const got = await harvestCandidates(
    { tags: ["broken", "ok"], pages: 1, max: 10, intervalMs: 0 },
    new Set(),
    depsWith({
      httpGet: (url) =>
        url.includes("broken")
          ? Promise.reject(new Error("boom"))
          : Promise.resolve(`<a href="/works/999"></a>`),
    }),
  );
  assertEquals(got, ["999"]);
});

Deno.test("harvestCandidates: 一覧取得ごとに intervalMs で sleep する", async () => {
  const slept: number[] = [];
  await harvestCandidates(
    { tags: ["a", "b"], pages: 2, max: 10, intervalMs: 2000 },
    new Set(),
    depsWith({
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    }),
  );
  assertEquals(slept, [2000, 2000, 2000, 2000]);
});

Deno.test("executeHarvest: 通常経路は register へ workId と --tag と --out を渡す", async () => {
  const registered: string[][] = [];
  const code = await executeHarvest(
    parseHarvestArgs(["t", "--max", "5"]),
    depsWith({
      httpGet: () => Promise.resolve(`<a href="/works/111"></a><a href="/works/222"></a>`),
      register: (argv) => {
        registered.push(argv);
        return Promise.resolve(0);
      },
    }),
  );
  assertEquals(code, 0);
  assertEquals(registered.length, 1);
  assertEquals(registered[0].slice(-4), [
    "--out",
    ".agents/runtime/dataset.jsonl",
    "--tag",
    "auto-harvest",
  ]);
  assertEquals(registered[0].slice(0, -4).sort(), ["111", "222"]);
});

Deno.test("executeHarvest: --out は seen の読み先と register の書き先の両方に効く", async () => {
  const seenPaths: string[] = [];
  const registered: string[][] = [];
  await executeHarvest(
    parseHarvestArgs(["t", "--out", "/tmp/other.jsonl"]),
    depsWith({
      httpGet: () => Promise.resolve(`<a href="/works/111"></a>`),
      loadSeen: (path) => {
        seenPaths.push(path);
        return Promise.resolve(new Set<string>());
      },
      register: (argv) => {
        registered.push(argv);
        return Promise.resolve(0);
      },
    }),
  );
  assertEquals(seenPaths, ["/tmp/other.jsonl"]);
  assertEquals(registered[0].includes("--out"), true);
  assertEquals(registered[0][registered[0].indexOf("--out") + 1], "/tmp/other.jsonl");
});

Deno.test("executeHarvest: --dry-run は register を呼ばない", async () => {
  let called = false;
  const code = await executeHarvest(
    parseHarvestArgs(["t", "--dry-run"]),
    depsWith({
      httpGet: () => Promise.resolve(`<a href="/works/111"></a>`),
      register: () => {
        called = true;
        return Promise.resolve(0);
      },
    }),
  );
  assertEquals(code, 0);
  assertEquals(called, false);
});

Deno.test("executeHarvest: 新規候補 0 件なら register を呼ばず正常終了する", async () => {
  let called = false;
  const code = await executeHarvest(
    parseHarvestArgs(["t"]),
    depsWith({
      httpGet: () => Promise.resolve(`<a href="/works/111"></a>`),
      loadSeen: () => Promise.resolve(new Set(["111"])),
      register: () => {
        called = true;
        return Promise.resolve(0);
      },
    }),
  );
  assertEquals(code, 0);
  assertEquals(called, false);
});

Deno.test("executeHarvest: register の終了コードを伝播する", async () => {
  const code = await executeHarvest(
    parseHarvestArgs(["t"]),
    depsWith({
      httpGet: () => Promise.resolve(`<a href="/works/111"></a>`),
      register: () => Promise.resolve(1),
    }),
  );
  assertEquals(code, 1);
});
