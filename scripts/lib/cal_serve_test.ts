// cal serve の設定解釈・assets コピー・HTTP ハンドラ（パストラバーサル対策込み）を検証する。
// Deno.serve 自体（実ネットワークリスン）は起動系のグルーコードなのでここでは対象にしない。

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  ASSET_FILES,
  contentTypeFor,
  copyAssets,
  createRequestHandler,
  openBrowserCommand,
  resolveAssetPath,
  serveOptions,
  shouldAutoOpen,
} from "./cal_serve.ts";

Deno.test("copyAssets: srcDir の4ファイルを distDir へ上書きコピーする", async () => {
  const base = await Deno.makeTempDir();
  const srcDir = join(base, "src");
  const distDir = join(base, "dist");
  try {
    await Deno.mkdir(srcDir, { recursive: true });
    for (const file of ASSET_FILES) {
      await Deno.writeTextFile(join(srcDir, file), `content:${file}`);
    }
    await copyAssets(srcDir, distDir);
    for (const file of ASSET_FILES) {
      assertEquals(await Deno.readTextFile(join(distDir, file)), `content:${file}`);
    }
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("copyAssets: 既存ファイルを上書きする（再実行できる）", async () => {
  const base = await Deno.makeTempDir();
  const srcDir = join(base, "src");
  const distDir = join(base, "dist");
  try {
    await Deno.mkdir(srcDir, { recursive: true });
    await Deno.mkdir(distDir, { recursive: true });
    for (const file of ASSET_FILES) {
      await Deno.writeTextFile(join(srcDir, file), "new");
      await Deno.writeTextFile(join(distDir, file), "old");
    }
    await copyAssets(srcDir, distDir);
    for (const file of ASSET_FILES) {
      assertEquals(await Deno.readTextFile(join(distDir, file)), "new");
    }
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("contentTypeFor: 拡張子ごとに正しい MIME を返す（.js は script として認識される型）", () => {
  assertEquals(contentTypeFor("index.html"), "text/html; charset=utf-8");
  assertEquals(contentTypeFor("app.js"), "text/javascript; charset=utf-8");
  assertEquals(contentTypeFor("format.js"), "text/javascript; charset=utf-8");
  assertEquals(contentTypeFor("style.css"), "text/css; charset=utf-8");
  assertEquals(contentTypeFor("cal.json"), "application/json; charset=utf-8");
  assertEquals(contentTypeFor("unknown.bin"), "application/octet-stream");
});

Deno.test("resolveAssetPath: ルートは index.html に解決される", () => {
  const resolved = resolveAssetPath("/dist", "/");
  assertEquals(resolved, join("/dist", "index.html"));
});

Deno.test("resolveAssetPath: distDir 配下のファイルは正しく解決される", () => {
  assertEquals(resolveAssetPath("/dist", "/app.js"), join("/dist", "app.js"));
  assertEquals(resolveAssetPath("/dist", "/cal.json"), join("/dist", "cal.json"));
});

Deno.test("resolveAssetPath: 素の ../ トラバーサルは拒否する", () => {
  assertEquals(resolveAssetPath("/dist", "/../etc/passwd"), undefined);
  assertEquals(resolveAssetPath("/dist", "/../../etc/passwd"), undefined);
});

Deno.test("resolveAssetPath: URL エンコードされたトラバーサル（%2e%2e%2f）も拒否する", () => {
  assertEquals(resolveAssetPath("/dist", "/%2e%2e%2fetc/passwd"), undefined);
  assertEquals(resolveAssetPath("/dist", "/%2e%2e/etc/passwd"), undefined);
});

Deno.test("createRequestHandler: / は index.html を text/html で返す", async () => {
  const base = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(base, "index.html"), "<html>root</html>");
    const handler = createRequestHandler(base);
    const res = await handler(new Request("http://localhost/"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/html; charset=utf-8");
    assertEquals(await res.text(), "<html>root</html>");
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("createRequestHandler: /cal.json を application/json で返す", async () => {
  const base = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(base, "cal.json"), '{"works":[]}');
    const handler = createRequestHandler(base);
    const res = await handler(new Request("http://localhost/cal.json"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
    assertEquals(await res.text(), '{"works":[]}');
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("createRequestHandler: /app.js を text/javascript で返す（module script の MIME 制約）", async () => {
  const base = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(base, "app.js"), "export const x = 1;");
    const handler = createRequestHandler(base);
    const res = await handler(new Request("http://localhost/app.js"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/javascript; charset=utf-8");
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("createRequestHandler: パストラバーサルは 403 で拒否する", async () => {
  const base = await Deno.makeTempDir();
  try {
    const handler = createRequestHandler(base);
    const res = await handler(new Request("http://localhost/%2e%2e%2fetc%2fpasswd"));
    assertEquals(res.status, 403);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("createRequestHandler: 存在しないファイルは 404 を返す", async () => {
  const base = await Deno.makeTempDir();
  try {
    const handler = createRequestHandler(base);
    const res = await handler(new Request("http://localhost/nope.js"));
    assertEquals(res.status, 404);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("serveOptions: hostname を 127.0.0.1 に固定する（Deno.serve 既定の 0.0.0.0 bind を避ける）", () => {
  assertEquals(serveOptions({ distDir: "/dist", port: 8000 }), {
    hostname: "127.0.0.1",
    port: 8000,
  });
});

Deno.test("serveOptions: config の port をそのまま使う", () => {
  assertEquals(serveOptions({ distDir: "/dist", port: 9999 }).port, 9999);
});

Deno.test("shouldAutoOpen: --no-open が無ければ true、あれば false", () => {
  assertEquals(shouldAutoOpen([]), true);
  assertEquals(shouldAutoOpen(["--no-open"]), false);
});

Deno.test("openBrowserCommand: OS ごとに正しいコマンドを選ぶ", () => {
  assertEquals(openBrowserCommand("http://localhost:8000/", "darwin")[0], "open");
  assertEquals(openBrowserCommand("http://localhost:8000/", "linux")[0], "xdg-open");
  const winCmd = openBrowserCommand("http://localhost:8000/", "windows");
  assert(winCmd.includes("start"));
});
