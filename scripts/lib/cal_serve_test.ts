// cal serve の設定解釈・assets コピー・HTTP ハンドラ（パストラバーサル対策・ラベル編集 API）を
// 検証する。Deno.serve 自体（実ネットワークリスン）は起動系のグルーコードなのでここでは対象にしない。

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import {
  ASSET_FILES,
  ASSET_SRC_DIR,
  contentTypeFor,
  copyAssets,
  createRequestHandler,
  missingCalJsonHint,
  openBrowserCommand,
  resolveAssetPath,
  serveOptions,
  shouldAutoOpen,
  unknownServeFlags,
} from "./cal_serve.ts";
import { loadLabels2, saveLabels2, setLabel } from "./labels_store.ts";

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

Deno.test("createRequestHandler: distDir 内の symlink が外部ファイルを指す場合は403で拒否する（symlink 封じ込め）", async () => {
  const base = await Deno.makeTempDir();
  try {
    const distDir = join(base, "dist");
    await Deno.mkdir(distDir, { recursive: true });
    const secretPath = join(base, "secret.txt");
    await Deno.writeTextFile(secretPath, "secret");
    await Deno.symlink(secretPath, join(distDir, "leak.txt"));

    const handler = createRequestHandler(distDir);
    const res = await handler(new Request("http://localhost/leak.txt"));
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

// --- Web ラベル編集 API（POST /labels / DELETE /labels/:siteWorkId） ---
// GET のみだった cal serve を read-write に拡張したときの API 契約。localhost 限定
// バインド (127.0.0.1) は既存の serveOptions で保証されるため、ここではハンドラの
// メソッド分岐・バリデーション・saveLabels2 の副作用だけを検証する。

async function withServeFixture(
  fn: (ctx: { distDir: string; labelsPath: string }) => Promise<void>,
): Promise<void> {
  const base = await Deno.makeTempDir();
  try {
    const distDir = join(base, "dist");
    await Deno.mkdir(distDir, { recursive: true });
    const labelsPath = join(base, "labels.jsonl");
    await fn({ distDir, labelsPath });
  } finally {
    await Deno.remove(base, { recursive: true });
  }
}

Deno.test("POST /labels: 品質ラベル「駄」を書き込み 200 を返す", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteWorkId: "kakuyomu:123", value: "駄" }),
      }),
    );
    assertEquals(res.status, 200);
    const labels = await loadLabels2(labelsPath);
    assertEquals(labels.length, 1);
    assertEquals(labels[0].siteWorkId, "kakuyomu:123");
    assertEquals(labels[0].quality, "駄");
  });
});

Deno.test("POST /labels: 「良」「対象外」も受理する（enum の 3 値）", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const handler = createRequestHandler(distDir, labelsPath);
    for (const value of ["良", "対象外"]) {
      const res = await handler(
        new Request("http://localhost/labels", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteWorkId: "kakuyomu:456", value }),
        }),
      );
      assertEquals(res.status, 200);
    }
    const labels = await loadLabels2(labelsPath);
    assertEquals(labels[0].scope, "対象外");
  });
});

Deno.test("POST /labels: 未対応の value（enum 外）は 400 で拒否し labels を書かない", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteWorkId: "kakuyomu:123", value: "ゴミ" }),
      }),
    );
    assertEquals(res.status, 400);
    assertEquals(await loadLabels2(labelsPath), []);
  });
});

Deno.test("POST /labels: siteWorkId 欠損は 400 で拒否する", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "良" }),
      }),
    );
    assertEquals(res.status, 400);
  });
});

Deno.test("POST /labels: siteWorkId 形式違反（site:数値ID以外）は 400 で拒否する", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteWorkId: "../etc/passwd", value: "良" }),
      }),
    );
    assertEquals(res.status, 400);
  });
});

Deno.test("POST /labels: JSON パース失敗は 400 で返しサーバーを落とさない", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-a-json",
      }),
    );
    assertEquals(res.status, 400);
  });
});

Deno.test("DELETE /labels/:siteWorkId: 該当行を削除して 200 を返す（未ラベルに戻す）", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    await saveLabels2(labelsPath, setLabel([], "kakuyomu:123", "良", "t"));
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels/kakuyomu:123", { method: "DELETE" }),
    );
    assertEquals(res.status, 200);
    assertEquals(await loadLabels2(labelsPath), []);
  });
});

Deno.test("DELETE /labels/:siteWorkId: 該当なしでも 200 を返す（べき等）", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels/kakuyomu:999", { method: "DELETE" }),
    );
    assertEquals(res.status, 200);
  });
});

Deno.test("DELETE /labels/:siteWorkId: siteWorkId 形式違反は 400 で拒否する", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    await Deno.writeTextFile(labelsPath, "");
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels/..%2Fpasswd", { method: "DELETE" }),
    );
    assertEquals(res.status, 400);
  });
});

Deno.test("DELETE /labels: siteWorkId パス欠損は 400 で拒否する", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(new Request("http://localhost/labels", { method: "DELETE" }));
    assertEquals(res.status, 400);
  });
});

Deno.test("createRequestHandler: /labels に対する未対応メソッド（PUT）は 405 を返す", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "PUT",
        body: JSON.stringify({ siteWorkId: "kakuyomu:1", value: "良" }),
      }),
    );
    assertEquals(res.status, 405);
  });
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

Deno.test("missingCalJsonHint: cal.json がなければヒント文字列を返す", async () => {
  const base = await Deno.makeTempDir();
  try {
    const hint = await missingCalJsonHint(base);
    assert(hint !== undefined);
    assertStringIncludes(hint, "cal.json");
    assertStringIncludes(hint, "deno task cal list");
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("missingCalJsonHint: cal.json があれば undefined を返す", async () => {
  const base = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(base, "cal.json"), '{"works":[]}');
    const hint = await missingCalJsonHint(base);
    assertEquals(hint, undefined);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("ASSET_FILES: app.js が参照するローカル ./*.js の import 先を漏れなく含む", async () => {
  // ブラウザは cal serve が dist にコピーしたファイルしか読めないため、app.js の import 対象が
  // ASSET_FILES から漏れると起動時に module resolution が 404 で失敗し、viewer が壊れる。
  // Deno のユニットテストは実 serve 経路を通らないので、asset の整合性はここで機械的に閉じ込める。
  const appSource = await Deno.readTextFile(`${ASSET_SRC_DIR}/app.js`);
  const importRe = /from\s+["']\.\/([A-Za-z0-9_.\-/]+)["']/g;
  const localImports = new Set<string>();
  for (const m of appSource.matchAll(importRe)) localImports.add(m[1]);
  assert(localImports.size > 0, "app.js からローカル import が1件も検出されないのは検査自体の不良");
  for (const file of localImports) {
    assert(
      ASSET_FILES.includes(file),
      `app.js は ./${file} を import しているのに ASSET_FILES に含まれていない`,
    );
  }
});

Deno.test("unknownServeFlags: --no-open は既知、他は未知扱い", () => {
  assertEquals(unknownServeFlags([]), []);
  assertEquals(unknownServeFlags(["--no-open"]), []);
  assertEquals(unknownServeFlags(["--bogus"]), ["--bogus"]);
  assertEquals(unknownServeFlags(["--no-open", "--extra"]), ["--extra"]);
});

Deno.test("openBrowserCommand: OS ごとに正しいコマンドを選ぶ", () => {
  assertEquals(openBrowserCommand("http://localhost:8000/", "darwin")[0], "open");
  assertEquals(openBrowserCommand("http://localhost:8000/", "linux")[0], "xdg-open");
  const winCmd = openBrowserCommand("http://localhost:8000/", "windows");
  assert(winCmd.includes("start"));
});
