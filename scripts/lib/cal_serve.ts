// cal serve サブコマンド: cal_viewer/ の静的 assets（index.html/app.js/style.css/format.js）を
// config の distDir へコピーし、Deno.serve で配信する。file:// で開くと CORS で cal.json を
// fetch できないため、ブラウザ描画には HTTP 配信が要る。デフォルトで起動時にブラウザを自動で
// 開く（--no-open で抑制）。Ctrl+C はプロセスの既定シグナル処理にまかせて終了する。
//
// Web ラベル編集のため POST /labels（品質ラベル書き込み）・DELETE /labels/:siteWorkId
// （未ラベルに戻す）を受け付ける。localhost 限定バインドは serveOptions で維持する。

import { copy, ensureDir } from "@std/fs";
import { extname, join, resolve } from "@std/path";
import { loadViewerConfig, type ViewerConfig } from "./cal_viewer_config.ts";
import { DEFAULT_LABELS } from "./labels_cli.ts";
import {
  deleteLabel,
  type LabelRecord2,
  type LabelValue,
  loadLabels2,
  saveLabels2,
  setLabel,
} from "./labels_store.ts";
import { labelsFor } from "./cal_list.ts";
import { atomicWriteText } from "./atomic_write.ts";

// ブラウザに配信する assets。ここに漏れると cal serve が dist にコピーせず、app.js の
// module import が 404 で失敗して viewer 全体が起動しない。app.js のローカル ./*.js import
// との整合は cal_serve_test.ts で機械的に検査する（追加/削除時はテストが赤くなる）。
export const ASSET_FILES = [
  "index.html",
  "app.js",
  "style.css",
  "format.js",
  "raw_metrics.js",
  "list_filter.js",
  "line_meta.js",
  "detail_join.js",
  "metric_display.js",
  "label_editor.js",
  "label_update.js",
  "toast.js",
];

// scripts/lib/cal_viewer/ の絶対パス（assets のソース）。cal.json はここに含めない
// （cal list が別途 distDir に直接書く）。
export const ASSET_SRC_DIR = new URL("./cal_viewer/", import.meta.url).pathname;

export async function copyAssets(srcDir: string, distDir: string): Promise<void> {
  await ensureDir(distDir);
  for (const file of ASSET_FILES) {
    await copy(`${srcDir}/${file}`, `${distDir}/${file}`, { overwrite: true });
  }
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export function contentTypeFor(path: string): string {
  return MIME_TYPES[extname(path)] ?? "application/octet-stream";
}

// パストラバーサル対策。要求パスを decode してから distDir の絶対パスへ resolve し、結果が
// distDir 配下に収まっているかで判定する（".." の文字列検査は %2e エンコードで迂回されるため
// 使わない。resolve 後の封じ込め判定だけが確実）。
export function resolveAssetPath(distDir: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const distAbs = resolve(distDir);
  const resolved = resolve(distAbs, relativePath);
  const withinBoundary = resolved === distAbs || resolved.startsWith(distAbs + "/");
  return withinBoundary ? resolved : undefined;
}

// siteWorkId の形式検証。DELETE のパスセグメントに使うためパス走査（".." "/"）を
// 含まないことも、この enum 的パターンで自動的に排除される（labels_store.resolveSiteWorkId
// と同じ集合）。URL エンコード済みの入力はハンドラ側で decodeURIComponent した後に照合する。
const SITE_WORK_ID_PATTERN = /^[a-z0-9_-]+:\d+$/i;

const LABEL_VALUES: readonly LabelValue[] = ["良", "駄", "対象外"];

function isValidLabelValue(value: unknown): value is LabelValue {
  return typeof value === "string" && (LABEL_VALUES as readonly string[]).includes(value);
}

function isValidSiteWorkId(value: unknown): value is string {
  return typeof value === "string" && SITE_WORK_ID_PATTERN.test(value);
}

// cal.json の該当作品 labels フィールドだけを差分 patch する（POST/DELETE /labels 成功時）。
// labels.jsonl は永続層、cal.json は viewer が実際に読む静的スナップショット。従来は cal list
// 実行時にしか再生成されず、Web ラベル編集の結果がリロードで消えるバグの直接原因になっていた。
// 全再生成 (buildCalJson) は scoring 依存を cal serve に持ち込む上、metrics/score まで走らせる
// のに対しラベル編集は labels フィールドしか変えないので fast-path として差分 patch を採る。
// 失敗（読込エラー・parse 失敗・該当作品なし・書込失敗のいずれか）は「labels.jsonl は正、
// cal.json 反映は次回 cal list で解消」の過渡的不整合として扱い、warning 文字列を返す。
// 例外を投げず undefined = 成功、string = 警告メッセージ の形にすることで、呼び出し側は
// try/catch を書かずに 200+warning レスポンスへ流せる。
async function patchCalJsonLabels(
  distDir: string,
  siteWorkId: string,
  newLabels: string[],
): Promise<string | undefined> {
  const calJsonPath = join(distDir, "cal.json");
  let text: string;
  try {
    text = await Deno.readTextFile(calJsonPath);
  } catch {
    return "cal.json への反映に失敗しました（読み込み不可）。次回 `deno task cal list` で解消します。";
  }
  let parsed: { works?: Array<{ siteWorkId?: string; labels?: string[] }> };
  try {
    parsed = JSON.parse(text);
  } catch {
    return "cal.json への反映に失敗しました（JSON parse 失敗）。次回 `deno task cal list` で解消します。";
  }
  const works = parsed.works;
  if (!Array.isArray(works)) {
    return "cal.json への反映に失敗しました（works 配列なし）。次回 `deno task cal list` で解消します。";
  }
  const index = works.findIndex((w) => w?.siteWorkId === siteWorkId);
  if (index === -1) {
    return `cal.json への反映をスキップしました（${siteWorkId} が cal.json に無い）。次回 \`deno task cal list\` で追加されます。`;
  }
  works[index] = { ...works[index], labels: newLabels };
  try {
    // atomic write（tmp + rename）で、書き込み途中のクラッシュで cal.json が半端に壊れて
    // viewer 全体が起動しなくなる事態を避ける。read は非 atomic のままだが、rename は
    // POSIX 上 atomic なので読み手は必ず「旧全体」か「新全体」のどちらかを読む。
    await atomicWriteText(calJsonPath, JSON.stringify(parsed, null, 2));
  } catch {
    return "cal.json への反映に失敗しました（書き込み不可）。次回 `deno task cal list` で解消します。";
  }
  return undefined;
}

// patchCalJsonLabels の結果を Response に載せる。warning あり → 200 + JSON body、なし →
// 現状互換の null body。client 側は content-type が application/json のときだけ body を読む
// ため、既存の 200 (body 空) を返していた成功系テスト・呼び出し元は変更不要（後方互換）。
function labelWriteResponse(warning: string | undefined): Response {
  if (warning === undefined) return new Response(null, { status: 200 });
  return new Response(JSON.stringify({ warning }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function labelsForSiteWorkId(records: LabelRecord2[], siteWorkId: string): string[] {
  return labelsFor(records.find((r) => r.siteWorkId === siteWorkId));
}

// POST /labels の body 契約: {siteWorkId, value}。setLabel を再利用して upsert し、
// saveLabels2 で永続化する。バリデーション違反はすべて 400 で拒否し labels を書かない。
// 永続化成功後、cal.json の該当作品 labels 配列も同じ内容へ差分 patch する（patch 失敗は
// 200 + warning で返し、labels.jsonl は正のままにする）。
async function handleLabelPost(
  req: Request,
  labelsPath: string,
  distDir: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return new Response("Invalid body", { status: 400 });
  }
  const { siteWorkId, value } = body as { siteWorkId?: unknown; value?: unknown };
  if (!isValidSiteWorkId(siteWorkId)) {
    return new Response("Invalid siteWorkId", { status: 400 });
  }
  if (!isValidLabelValue(value)) {
    return new Response("Invalid value", { status: 400 });
  }
  const records = await loadLabels2(labelsPath);
  const updated = setLabel(records, siteWorkId, value, new Date().toISOString());
  await saveLabels2(labelsPath, updated);
  const warning = await patchCalJsonLabels(
    distDir,
    siteWorkId,
    labelsForSiteWorkId(updated, siteWorkId),
  );
  return labelWriteResponse(warning);
}

// DELETE /labels/:siteWorkId 契約: 該当行を除いた配列で labels.jsonl を再保存する。
// 存在しない ID でも 200（べき等）。siteWorkId のパスセグメントは decode 後に enum
// パターンへ照合し、"../" や "%2F" などの逸脱は 400 で弾く。cal.json 側は該当作品の
// labels を空配列に patch する（作品エントリ自体は残す＝未ラベル state を示す）。
async function handleLabelDelete(
  pathname: string,
  labelsPath: string,
  distDir: string,
): Promise<Response> {
  const rest = pathname.replace(/^\/labels\/?/, "");
  if (rest === "") return new Response("siteWorkId required", { status: 400 });
  let siteWorkId: string;
  try {
    siteWorkId = decodeURIComponent(rest);
  } catch {
    return new Response("Invalid siteWorkId", { status: 400 });
  }
  if (!isValidSiteWorkId(siteWorkId)) {
    return new Response("Invalid siteWorkId", { status: 400 });
  }
  const records = await loadLabels2(labelsPath);
  await saveLabels2(labelsPath, deleteLabel(records, siteWorkId));
  const warning = await patchCalJsonLabels(distDir, siteWorkId, []);
  return labelWriteResponse(warning);
}

// resolveAssetPath の封じ込め判定は文字列 resolve のみで symlink を辿らない。distDir 配下に
// 外部ファイルを指す symlink を置かれると、そのままでは 200 で読み出せてしまう（実プロダクト
// 用ではないが cal.json を含む dist を localhost に配信する以上、閉じ込めは必須）。実体パス
// （symlink 解決後）同士で比較して初めて封じ込めが成立するため、distDir の実体パスはハンドラ
// 生成時に一度だけ解決し、リクエストのたびに候補ファイルの実体パスと突き合わせる。
//
// labelsPath は POST/DELETE /labels の永続化先。GET のみで運用する既存呼び出しから
// 段階的に受け入れられるよう省略可（省略時は DEFAULT_LABELS）。
export function createRequestHandler(
  distDir: string,
  labelsPath: string = DEFAULT_LABELS,
): (req: Request) => Promise<Response> {
  const realDistDirPromise = Deno.realPath(resolve(distDir));

  // POST/DELETE /labels は「labels.jsonl を読む → 更新する → 書き戻す → cal.json を patch する」
  // を含む read-modify-write。2 リクエストが同時に来ると同じ初期状態を読み、片方の書き戻しが
  // もう片方を消す（labels.jsonl は原本なのでデータ喪失）。Deno のシングルスレッド実行下では
  // Promise chain で書き込み系ハンドラを順に流すだけで直列化できるため、queue を handler の
  // クロージャに持つ（テスト間・サーバ間で干渉させないため module-level にはしない）。
  // localhost 単ユーザー用途で人間操作は 1 秒に 1 回程度なので、順序化のコストは無視できる。
  let writeQueue: Promise<unknown> = Promise.resolve();
  const serializeWrite = <T>(op: () => Promise<T>): Promise<T> => {
    // 前段が失敗しても後続を止めない（onrejected にも op を渡すのは、前が失敗した後の
    // 次リクエストが「前の失敗」を承継しないようにするため）。
    const next = writeQueue.then(op, op);
    writeQueue = next.catch(() => {});
    return next;
  };

  return async (req: Request) => {
    const { pathname } = new URL(req.url);

    // /labels* は API 側の分岐。静的配信のパス解決には落とさない（asset 名衝突の予防）。
    if (pathname === "/labels" || pathname.startsWith("/labels/")) {
      if (req.method === "POST" && pathname === "/labels") {
        return await serializeWrite(() => handleLabelPost(req, labelsPath, distDir));
      }
      if (req.method === "DELETE") {
        return await serializeWrite(() => handleLabelDelete(pathname, labelsPath, distDir));
      }
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "POST, DELETE" },
      });
    }

    const filePath = resolveAssetPath(distDir, pathname);
    if (!filePath) return new Response("Forbidden", { status: 403 });

    let realFilePath: string;
    try {
      realFilePath = await Deno.realPath(filePath);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) return new Response("Not Found", { status: 404 });
      throw e;
    }

    const realDistDir = await realDistDirPromise;
    const withinBoundary = realFilePath === realDistDir ||
      realFilePath.startsWith(realDistDir + "/");
    if (!withinBoundary) return new Response("Forbidden", { status: 403 });

    const body = await Deno.readFile(realFilePath);
    return new Response(body, { headers: { "content-type": contentTypeFor(realFilePath) } });
  };
}

// cal.json が未生成のまま cal serve すると、ブラウザ側は fetch 失敗のエラーメッセージしか
// 出さず「先に cal list を実行する」という手順に気づきにくい。起動時に一度だけ確認し、
// 欠けていればヒントを返す（存在すれば undefined ＝非致命的、配信は続ける）。
export async function missingCalJsonHint(distDir: string): Promise<string | undefined> {
  try {
    await Deno.stat(join(distDir, "cal.json"));
    return undefined;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return "ℹ️ cal.json が見つかりません。先に `deno task cal list` を実行してください。";
    }
    throw e;
  }
}

export function shouldAutoOpen(argv: string[]): boolean {
  return !argv.includes("--no-open");
}

// serve 用の既知フラグ以外は typo として即座に返し、意図せず素通りするのを防ぐ。
// list/evaluate と揃えて、未知フラグは非零 exit で運用者に気づかせる。
const KNOWN_SERVE_FLAGS = new Set(["--no-open"]);

export function unknownServeFlags(argv: string[]): string[] {
  return argv.filter((a) => !KNOWN_SERVE_FLAGS.has(a));
}

export function openBrowserCommand(
  url: string,
  os: typeof Deno.build.os = Deno.build.os,
): string[] {
  if (os === "darwin") return ["open", url];
  if (os === "windows") return ["cmd", "/c", "start", "", url];
  return ["xdg-open", url];
}

function openBrowser(url: string): void {
  try {
    const [cmd, ...args] = openBrowserCommand(url);
    new Deno.Command(cmd, { args }).spawn();
  } catch (e) {
    console.error(`ブラウザを自動で開けませんでした。手動で開いてください: ${url}（${e}）`);
  }
}

// hostname を明示しないと Deno.serve の既定値 0.0.0.0 で全インターフェースへ bind される。
// cal.json は作品本文由来のメタを含み著作権上 git 管理外にしている（cal_viewer_config の
// デフォルト distDir 参照）以上、LAN 越しに露出させるのは事故なので localhost 限定にする。
export function serveOptions(cfg: ViewerConfig): { hostname: string; port: number } {
  return { hostname: "127.0.0.1", port: cfg.port };
}

export async function runServe(argv: string[], config?: ViewerConfig): Promise<number> {
  const unknown = unknownServeFlags(argv);
  if (unknown.length > 0) {
    console.error(`未知のフラグ: ${unknown.join(" ")}`);
    console.error("使い方: deno task cal serve [--no-open]");
    return 1;
  }
  const cfg = config ?? await loadViewerConfig();
  await copyAssets(ASSET_SRC_DIR, cfg.distDir);

  const hint = await missingCalJsonHint(cfg.distDir);
  if (hint) console.error(hint);

  const handler = createRequestHandler(cfg.distDir, DEFAULT_LABELS);
  const server = Deno.serve({ ...serveOptions(cfg), onListen: () => {} }, handler);
  const url = `http://localhost:${cfg.port}/`;
  console.log(`cal viewer を配信中: ${url}（Ctrl+C で終了）`);

  if (shouldAutoOpen(argv)) openBrowser(url);

  await server.finished;
  return 0;
}

if (import.meta.main) {
  Deno.exit(await runServe(Deno.args));
}
