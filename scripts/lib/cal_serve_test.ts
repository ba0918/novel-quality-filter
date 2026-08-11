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

// cal.json の該当作品 labels フィールドだけを patch する差分更新の検証で使う最小限の
// cal.json fixture。works の要素は siteWorkId / labels の他に「patch で触られていないこと」を
// 検証するための飾りフィールドを持つ（実本番の CalWork は canonical/experiment/meta 等を持つが、
// ここでは他フィールドを不変で保つ契約が守られていれば十分なので余計な shape を持ち込まない）。
function calJsonFixture(works: Array<Record<string, unknown>>): string {
  return JSON.stringify(
    {
      generatedAt: "2026-01-01T00:00:00.000Z",
      canonicalWeightsRef: "src/domain/scoring/weights.ts",
      experimentWeightsRef: "src/domain/scoring/weights_experiment.ts",
      works,
    },
    null,
    2,
  );
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

// --- cal.json 差分 patch（labels フィールドだけを更新する契約） ---
// labels.jsonl は永続層、cal.json は viewer が実際に読む静的スナップショット。
// 従来は cal list 実行時にしか再生成されず、Web ラベル編集の結果がリロードで消える
// バグを招いていた。POST/DELETE 成功時に該当作品の labels 配列だけを patch することで、
// ラベル以外（metrics/score/meta）を触らず fast-path で反映する。全再生成 (buildCalJson) の
// 呼び出しは避ける（依存が重く、cal serve から scoring を呼ぶ動線を作らないため）。

Deno.test("POST /labels: cal.json の該当作品 labels 配列を新値に patch する", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    await Deno.writeTextFile(
      join(distDir, "cal.json"),
      calJsonFixture([
        { siteWorkId: "kakuyomu:123", title: "作品A", labels: [] },
        { siteWorkId: "kakuyomu:456", title: "作品B", labels: ["良"] },
      ]),
    );
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteWorkId: "kakuyomu:123", value: "駄" }),
      }),
    );
    assertEquals(res.status, 200);
    const patched = JSON.parse(await Deno.readTextFile(join(distDir, "cal.json")));
    assertEquals(patched.works[0].labels, ["駄"]);
    // 他作品は不変。
    assertEquals(patched.works[1].labels, ["良"]);
  });
});

Deno.test("POST /labels: cal.json patch は該当作品の他フィールドを一切触らない", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const originalWork = {
      siteWorkId: "kakuyomu:123",
      title: "作品A",
      author: "著者A",
      labels: [],
      canonical: { score: 42, metrics: [], penalties: [] },
      experiment: { score: 45, metrics: [], penalties: [] },
      meta: { reviewCount: 10, totalReviewPoint: 100 },
      diff: 3,
    };
    await Deno.writeTextFile(join(distDir, "cal.json"), calJsonFixture([originalWork]));
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteWorkId: "kakuyomu:123", value: "良" }),
      }),
    );
    assertEquals(res.status, 200);
    const patched = JSON.parse(await Deno.readTextFile(join(distDir, "cal.json")));
    const patchedWork = patched.works[0];
    // labels 以外の全フィールドが元のまま。
    assertEquals(patchedWork.title, originalWork.title);
    assertEquals(patchedWork.author, originalWork.author);
    assertEquals(patchedWork.canonical, originalWork.canonical);
    assertEquals(patchedWork.experiment, originalWork.experiment);
    assertEquals(patchedWork.meta, originalWork.meta);
    assertEquals(patchedWork.diff, originalWork.diff);
    assertEquals(patchedWork.labels, ["良"]);
  });
});

Deno.test("POST /labels: 「対象外」選択で既存 quality を保持した labels 配列に patch する", async () => {
  // labels_store.setLabel の「対象外は scope のみ更新、quality 保持」と、cal_list.labelsFor
  // の順序（["quality?", "対象外"?, ...tags]）が一貫することを ふたつの層をまたいで検証する。
  await withServeFixture(async ({ distDir, labelsPath }) => {
    await saveLabels2(labelsPath, setLabel([], "kakuyomu:123", "良", "t"));
    await Deno.writeTextFile(
      join(distDir, "cal.json"),
      calJsonFixture([{ siteWorkId: "kakuyomu:123", labels: ["良"] }]),
    );
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteWorkId: "kakuyomu:123", value: "対象外" }),
      }),
    );
    assertEquals(res.status, 200);
    const patched = JSON.parse(await Deno.readTextFile(join(distDir, "cal.json")));
    assertEquals(patched.works[0].labels, ["良", "対象外"]);
  });
});

Deno.test("DELETE /labels/:siteWorkId: cal.json の該当作品 labels 配列を空にする", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    await saveLabels2(labelsPath, setLabel([], "kakuyomu:123", "良", "t"));
    await Deno.writeTextFile(
      join(distDir, "cal.json"),
      calJsonFixture([{ siteWorkId: "kakuyomu:123", labels: ["良"] }]),
    );
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels/kakuyomu:123", { method: "DELETE" }),
    );
    assertEquals(res.status, 200);
    const patched = JSON.parse(await Deno.readTextFile(join(distDir, "cal.json")));
    assertEquals(patched.works[0].labels, []);
  });
});

Deno.test("POST /labels: cal.json に該当作品が無い場合は labels.jsonl のみ更新し 200+warning を返す", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    await Deno.writeTextFile(
      join(distDir, "cal.json"),
      calJsonFixture([{ siteWorkId: "kakuyomu:999", labels: [] }]),
    );
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteWorkId: "kakuyomu:123", value: "良" }),
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
    const body = await res.json();
    assertStringIncludes(body.warning, "cal.json");
    // labels.jsonl 側は正しく更新されている。
    const labels = await loadLabels2(labelsPath);
    assertEquals(labels[0].quality, "良");
  });
});

Deno.test("POST /labels: cal.json 書き込み失敗（読み込み時 parse エラー）は 200+warning を返す", async () => {
  // 「labels.jsonl は正、cal.json 反映失敗」を過渡的不整合として扱う契約。
  // 決定的な故障注入として cal.json に不正 JSON を書いておくと read/parse で確実に失敗する。
  // client は warning toast を出すだけで rollback しない（labels.jsonl が正なので UI 表示を
  // 戻すとむしろズレる）。次回 cal list で cal.json が再生成されれば自然に整合する。
  await withServeFixture(async ({ distDir, labelsPath }) => {
    await Deno.writeTextFile(join(distDir, "cal.json"), "not-a-json");
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteWorkId: "kakuyomu:123", value: "駄" }),
      }),
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertStringIncludes(body.warning, "cal.json");
    const labels = await loadLabels2(labelsPath);
    assertEquals(labels[0].quality, "駄");
  });
});

Deno.test("POST /labels: cal.json 未生成でも 200+warning を返し labels.jsonl は更新される", async () => {
  await withServeFixture(async ({ distDir, labelsPath }) => {
    const handler = createRequestHandler(distDir, labelsPath);
    const res = await handler(
      new Request("http://localhost/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteWorkId: "kakuyomu:123", value: "良" }),
      }),
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertStringIncludes(body.warning, "cal.json");
    const labels = await loadLabels2(labelsPath);
    assertEquals(labels[0].quality, "良");
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

Deno.test("ASSET_FILES: app.js からの推移的なローカル ./*.js import を漏れなく含む", async () => {
  // ブラウザは cal serve が dist にコピーしたファイルしか読めないため、app.js の import 対象が
  // ASSET_FILES から漏れると起動時に module resolution が 404 で失敗し、viewer が壊れる。
  // Deno のユニットテストは実 serve 経路を通らないので、asset の整合性はここで機械的に閉じ込める。
  // toast.js のような推移的 import（app.js → label_editor.js → toast.js）まで含めるため
  // BFS で辿ってから ASSET_FILES との差分を検査する。
  const importRe = /from\s+["']\.\/([A-Za-z0-9_.\-/]+)["']/g;
  const discovered = new Set<string>(["app.js"]);
  const queue: string[] = ["app.js"];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const source = await Deno.readTextFile(`${ASSET_SRC_DIR}/${current}`);
    for (const m of source.matchAll(importRe)) {
      const next = m[1];
      if (!discovered.has(next)) {
        discovered.add(next);
        // .js ファイルだけ再帰的に辿る（.css/.json は起点にならない）。
        if (next.endsWith(".js")) queue.push(next);
      }
    }
  }
  assert(
    discovered.size > 1,
    "app.js からローカル import が1件も検出されないのは検査自体の不良",
  );
  for (const file of discovered) {
    if (file === "app.js") continue; // app.js 自身は起点で常に含まれる
    assert(
      ASSET_FILES.includes(file),
      `推移的に import されている ./${file} が ASSET_FILES に含まれていない`,
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
