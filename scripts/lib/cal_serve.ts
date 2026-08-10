// cal serve サブコマンド: cal_viewer/ の静的 assets（index.html/app.js/style.css/format.js）を
// config の distDir へコピーし、Deno.serve で配信する。file:// で開くと CORS で cal.json を
// fetch できないため、ブラウザ描画には HTTP 配信が要る。デフォルトで起動時にブラウザを自動で
// 開く（--no-open で抑制）。Ctrl+C はプロセスの既定シグナル処理にまかせて終了する。

import { copy, ensureDir } from "@std/fs";
import { extname, join, resolve } from "@std/path";
import { loadViewerConfig, type ViewerConfig } from "./cal_viewer_config.ts";

export const ASSET_FILES = ["index.html", "app.js", "style.css", "format.js"];

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

// resolveAssetPath の封じ込め判定は文字列 resolve のみで symlink を辿らない。distDir 配下に
// 外部ファイルを指す symlink を置かれると、そのままでは 200 で読み出せてしまう（実プロダクト
// 用ではないが cal.json を含む dist を localhost に配信する以上、閉じ込めは必須）。実体パス
// （symlink 解決後）同士で比較して初めて封じ込めが成立するため、distDir の実体パスはハンドラ
// 生成時に一度だけ解決し、リクエストのたびに候補ファイルの実体パスと突き合わせる。
export function createRequestHandler(distDir: string): (req: Request) => Promise<Response> {
  const realDistDirPromise = Deno.realPath(resolve(distDir));

  return async (req: Request) => {
    const { pathname } = new URL(req.url);
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
  const cfg = config ?? await loadViewerConfig();
  await copyAssets(ASSET_SRC_DIR, cfg.distDir);

  const hint = await missingCalJsonHint(cfg.distDir);
  if (hint) console.error(hint);

  const handler = createRequestHandler(cfg.distDir);
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
