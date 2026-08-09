// 較正の「不動の原本」ストア。取得した生HTMLと採点手順のメモ(manifest)を作品ごとに保存し、
// 再フェッチなしで再導出できるようにする。順序の正は manifest.fetched 一箇所だけに持たせ、
// ファイル名の連番は人間向けの飾りにとどめる。

import { join } from "@std/path";
import { type EpisodeHealth, validateEpisodeHtml } from "../../src/background/fetchers/kakuyomu.ts";

// 数え方ロジック（行分割・文字カウント）に依存する数値を、どのバージョンで算出したか記録する。
// ロジックを変えたらこの値を上げ、原本から作り直す。
export const PIPELINE_VERSION = "line-meta-1";

export interface FetchedEntry {
  episodeId: string;
  url: string;
  order: number;
  file: string;
}

export interface CaptureDecision {
  sampledCount: number;
  targetEpisodeIndex: number;
  openingType: string;
  // 採点対象へ連結した話の order 列（単話採点なら要素1）。
  concatOrder: number[];
}

export interface CaptureManifest {
  captureId: string;
  site: string;
  workId: string;
  siteWorkId: string;
  fetched: FetchedEntry[];
  decision: CaptureDecision;
  pipelineVersion: string;
  capturedAt: string;
  health: EpisodeHealth;
}

export interface CapturePage {
  entry: FetchedEntry;
  html: string;
}

export interface Capture {
  manifest: CaptureManifest;
  pages: CapturePage[];
}

const MANIFEST_FILE = "manifest.json";
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function siteWorkId(site: string, workId: string): string {
  return `${site}:${workId}`;
}

// captureId をファイル名安全にする（コロン・ドットをハイフンへ）。取得日時から決定的に作る。
export function makeCaptureId(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

// pages/{site}_{workId}/{captureId}/ を組み立てる。各セグメントは英数と _- のみに制限し、
// パストラバーサル（../ 等）を弾く（原本の書き込み先を作品IDで汚染させない）。
export function captureDir(
  baseDir: string,
  site: string,
  workId: string,
  captureId: string,
): string {
  return join(baseDir, "pages", `${safe(site)}_${safe(workId)}`, safe(captureId));
}

function safe(segment: string): string {
  if (!SAFE_SEGMENT.test(segment)) {
    throw new Error(`Unsafe path segment: ${segment}`);
  }
  return segment;
}

// 不良HTML（エラー/年齢確認ページ等）を原本として保存しないための門番。全ページの健全性を
// 検証してから初めて書き込む（部分保存で壊れた原本を残さない、C5）。
export async function saveCapture(
  baseDir: string,
  capture: Capture,
  validate: (html: string) => EpisodeHealth = (html) => validateEpisodeHtml(200, html),
): Promise<void> {
  for (const page of capture.pages) {
    const health = validate(page.html);
    if (!health.healthy) {
      throw new Error(`Refusing to store unhealthy page ${page.entry.episodeId}: ${health.reason}`);
    }
  }

  const { site, workId, captureId } = capture.manifest;
  const dir = captureDir(baseDir, site, workId, captureId);
  await Deno.mkdir(dir, { recursive: true });
  for (const page of capture.pages) {
    await Deno.writeTextFile(join(dir, page.entry.file), page.html);
  }
  await Deno.writeTextFile(
    join(dir, MANIFEST_FILE),
    JSON.stringify(capture.manifest, null, 2) + "\n",
  );
}

// manifest.fetched の並び順で原本を読み戻す。ファイルシステム上の並び順には依存しない。
export async function loadCapture(dir: string): Promise<Capture> {
  const manifest = JSON.parse(await Deno.readTextFile(join(dir, MANIFEST_FILE))) as CaptureManifest;
  const pages: CapturePage[] = [];
  for (const entry of manifest.fetched) {
    pages.push({ entry, html: await Deno.readTextFile(join(dir, entry.file)) });
  }
  return { manifest, pages };
}
