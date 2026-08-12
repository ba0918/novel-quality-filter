// cal harvest サブコマンド: タグ×更新順の一覧ページから未収集の workId を無作為に収穫し、
// そのまま register 経路 (collectWork) へ渡してワンステップで収集・登録する。
// 本体は候補収穫だけを担い、収集・採点・凍結保存・rate limit (1秒間隔・作品あたり最大2話)
// は register 側が強制する。--dry-run で候補表示のみ。
//
// 1fb956d で撤去した crawl_tags.ts は「取得から採点まで自前でやる使い捨て入口」だったが、
// こちらは収穫→正規経路への委譲のみで、cal 一本化の方針に沿う。

import { sleep } from "../../src/shared/async.ts";
import { FETCH_TIMEOUT_MS } from "../../src/shared/constants.ts";
import { loadDataset, seenWorkIds } from "./dataset.ts";
import { extractWorkIds } from "./kakuyomu_listing.ts";
import { runRegister } from "./cal_register.ts";

const DEFAULT_DATASET = ".agents/runtime/dataset.jsonl";
const LISTING_INTERVAL_MS = 2000; // カクヨムへの礼儀 (旧 crawl_tags.ts と同じ間隔)

// 較正クロールで実績のあるシードタグ (旧 crawl_tags.ts の既定リストを引き継ぐ)
export const DEFAULT_SEED_TAGS = [
  "異世界",
  "美少女",
  "ハイファンタジー",
  "悪役転生",
  "主人公最強",
  "ざまぁ",
  "TS",
  "ガールズラブ",
  "配信",
  "VRMMO",
  "AI本文利用",
  "AI補助",
  "曇らせ",
  "ハーレム",
];

export interface HarvestOptions {
  tags: string[];
  max: number;
  pages: number;
  dryRun: boolean;
  registerTags: string[];
  datasetPath: string;
  intervalMs: number;
}

export interface HarvestDeps {
  httpGet: (url: string) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  loadSeen: (datasetPath: string) => Promise<Set<string>>;
  register: (argv: string[]) => Promise<number>;
}

export function parseHarvestArgs(argv: string[]): HarvestOptions {
  const tags: string[] = [];
  const registerTags: string[] = [];
  let max = 30;
  let pages = 1;
  let dryRun = false;
  let datasetPath = DEFAULT_DATASET;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max") max = Number(argv[++i]);
    else if (a === "--pages") pages = Number(argv[++i]);
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--tag") registerTags.push(argv[++i]);
    else if (a === "--out") datasetPath = argv[++i];
    else tags.push(a);
  }
  return {
    tags: tags.length > 0 ? tags : DEFAULT_SEED_TAGS,
    max,
    pages,
    dryRun,
    registerTags: registerTags.length > 0 ? registerTags : ["auto-harvest"],
    datasetPath,
    intervalMs: LISTING_INTERVAL_MS,
  };
}

export function listingUrl(tag: string, page: number): string {
  return `https://kakuyomu.jp/tags/${
    encodeURIComponent(tag)
  }?order=last_episode_published_at&page=${page}`;
}

// Fisher-Yates。更新順 firehose を無作為化し、上限内でタグ横断の広がりを得る。
function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// タグ×頁を掃いて未収集 workId を集め、無作為抽出で max 件に絞る。
// 一覧取得の失敗はそのタグ×頁だけログして続行する (1 タグの失敗で全体を止めない)。
export async function harvestCandidates(
  opts: Pick<HarvestOptions, "tags" | "pages" | "max" | "intervalMs">,
  seen: Set<string>,
  deps: HarvestDeps,
): Promise<string[]> {
  const found: string[] = [];
  const inRun = new Set<string>();
  for (const tag of opts.tags) {
    for (let page = 1; page <= opts.pages; page++) {
      try {
        const html = await deps.httpGet(listingUrl(tag, page));
        for (const id of extractWorkIds(html)) {
          if (!seen.has(id) && !inRun.has(id)) {
            inRun.add(id);
            found.push(id);
          }
        }
      } catch (e) {
        console.error(`  ✗ 一覧取得失敗 [${tag} p${page}]: ${e instanceof Error ? e.message : e}`);
      }
      await deps.sleep(opts.intervalMs);
    }
  }
  return shuffle(found, deps.random).slice(0, opts.max);
}

export async function executeHarvest(
  opts: HarvestOptions,
  deps: HarvestDeps,
): Promise<number> {
  const seen = await deps.loadSeen(opts.datasetPath);
  const candidates = await harvestCandidates(opts, seen, deps);
  console.log(`候補 ${candidates.length} 件 (既収集 ${seen.size} 件はスキップ)`);
  if (candidates.length === 0) {
    console.log("新規候補なし");
    return 0;
  }
  if (opts.dryRun) {
    for (const id of candidates) console.log(`  ${id}`);
    return 0;
  }
  const tagArgs = opts.registerTags.flatMap((t) => ["--tag", t]);
  return await deps.register([...candidates, ...tagArgs]);
}

function httpGetText(url: string): Promise<string> {
  return fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "Mozilla/5.0 (compatible; novel-quality-filter/collect)" },
  }).then((res) => res.text());
}

export async function runHarvest(argv: string[]): Promise<number> {
  return await executeHarvest(parseHarvestArgs(argv), {
    httpGet: httpGetText,
    sleep,
    random: Math.random,
    loadSeen: async (path) => seenWorkIds(await loadDataset(path)),
    register: runRegister,
  });
}
