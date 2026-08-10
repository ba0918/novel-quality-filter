// 較正の「不動の原本」ストア。取得した生HTMLと採点手順のメモ(manifest)を作品ごとに保存し、
// 再フェッチなしで再導出できるようにする。順序の正は manifest.fetched 一箇所だけに持たせ、
// ファイル名の連番は人間向けの飾りにとどめる。

import { isAbsolute, join, relative, resolve } from "@std/path";
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
// 原本ファイル名は「単一の安全なファイル名」に限る。ドットは連番+拡張子のために許すが、
// パス区切り（/ \）や絶対パスは許さない。`.`/`..` はディレクトリ参照なので明示的に弾く。
const SAFE_FILE = /^[A-Za-z0-9._-]+$/;

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

// 原本ファイルの読み書き先を、キャプチャディレクトリ内の安全な単一ファイルに限定する。
// manifest の file 値は外部由来（保存済み manifest.json）でありうるため、書き込み・読み込みの
// 双方でここを通し、正規化後の解決パスがキャプチャディレクトリ内に留まることを検証する。
function resolveCaptureFile(dir: string, file: string): string {
  if (file === "." || file === ".." || isAbsolute(file) || !SAFE_FILE.test(file)) {
    throw new Error(`Unsafe capture file name: ${file}`);
  }
  const root = resolve(dir);
  const target = resolve(root, file);
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Unsafe capture file escapes directory: ${file}`);
  }
  return target;
}

// pages と manifest.fetched が同じ取得事実を指していることを検証する。順序の正は
// manifest.fetched 一箇所に持たせるが、pages と食い違ったまま保存すると、読み戻し時に
// manifest 順で参照する原本が pages とずれる。件数・並び・各エントリの一致を保存前に固定する。
function assertPagesMatchFetched(capture: Capture): void {
  const { pages, manifest } = capture;
  const mismatch = (reason: string) =>
    new Error(`Manifest fetched entries do not match pages: ${reason}`);
  if (pages.length !== manifest.fetched.length) {
    throw mismatch(`count ${pages.length} vs ${manifest.fetched.length}`);
  }
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i].entry;
    const f = manifest.fetched[i];
    if (
      p.file !== f.file || p.episodeId !== f.episodeId || p.url !== f.url || p.order !== f.order
    ) {
      throw mismatch(`entry ${i}`);
    }
  }
}

// 不良HTML（エラー/年齢確認ページ等）を原本として保存しないための門番。全ページの健全性を
// 検証してから初めて書き込む（部分保存で壊れた原本を残さない、C5）。
export async function saveCapture(
  baseDir: string,
  capture: Capture,
  validate: (html: string) => EpisodeHealth = (html) => validateEpisodeHtml(200, html),
): Promise<void> {
  const { site, workId, captureId } = capture.manifest;
  const dir = captureDir(baseDir, site, workId, captureId);
  // 健全性・ファイル名の検証はすべて書き込み前に済ませる（不良を含むキャプチャで
  // 原本を部分的に書き残さない、C5・パストラバーサル防止 F2）。
  for (const page of capture.pages) {
    const health = validate(page.html);
    if (!health.healthy) {
      throw new Error(`Refusing to store unhealthy page ${page.entry.episodeId}: ${health.reason}`);
    }
    resolveCaptureFile(dir, page.entry.file);
  }
  // manifest.fetched は manifest.json へそのまま書き出すため、pages とは独立に file を検証する。
  // pages 側だけ安全でも、manifest.fetched に混入した不正 file を素通しさせない（F2）。
  for (const entry of capture.manifest.fetched) {
    resolveCaptureFile(dir, entry.file);
  }
  assertPagesMatchFetched(capture);

  await Deno.mkdir(dir, { recursive: true });
  for (const page of capture.pages) {
    await Deno.writeTextFile(resolveCaptureFile(dir, page.entry.file), page.html);
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
    pages.push({ entry, html: await Deno.readTextFile(resolveCaptureFile(dir, entry.file)) });
  }
  return { manifest, pages };
}
