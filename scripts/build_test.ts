import { assert, assertEquals } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";

const DIST = join(new URL("..", import.meta.url).pathname, "dist");

Deno.test("build: dist directory exists", async () => {
  assert(await exists(DIST));
});

Deno.test("build: manifest.json exists and is valid", async () => {
  const manifestPath = join(DIST, "manifest.json");
  assert(await exists(manifestPath));

  const manifest = JSON.parse(await Deno.readTextFile(manifestPath));
  assertEquals(manifest.manifest_version, 3);
  assertEquals(manifest.name, "Novel Quality Filter");
  assert(manifest.background?.service_worker);
  assert(manifest.content_scripts?.length > 0);
  assert(manifest.action?.default_popup);
  assert(manifest.content_security_policy?.extension_pages?.includes("wasm-unsafe-eval"));
});

Deno.test("build: background.js exists and has content", async () => {
  const bgPath = join(DIST, "background.js");
  assert(await exists(bgPath));
  const stat = await Deno.stat(bgPath);
  assert(stat.size > 1000, "background.js should contain lindera-wasm glue code");
});

Deno.test("build: content script exists", async () => {
  const contentPath = join(DIST, "content/kakuyomu.js");
  assert(await exists(contentPath));
});

Deno.test("build: popup files exist", async () => {
  assert(await exists(join(DIST, "popup/popup.html")));
  assert(await exists(join(DIST, "popup/popup.js")));
});

Deno.test("build: WASM binary exists and is >10MB", async () => {
  const wasmPath = join(DIST, "wasm/lindera_wasm_bg.wasm");
  assert(await exists(wasmPath));
  const stat = await Deno.stat(wasmPath);
  assert(stat.size > 10 * 1024 * 1024, "WASM binary should be >10MB (lindera-wasm-ipadic)");
});
