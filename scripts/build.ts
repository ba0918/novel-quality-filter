import * as esbuild from "esbuild";
import { denoPlugins } from "esbuild-deno-loader";
import { ensureDir } from "jsr:@std/fs@^1";
import { join } from "@std/path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const CONFIG_PATH = join(ROOT, "deno.json");

function findWasmBinary(): string {
  const resolved = import.meta.resolve("lindera-wasm-ipadic-web/lindera_wasm_bg.wasm");
  return new URL(resolved).pathname;
}

async function build() {
  console.log("=== Novel Quality Filter Build ===\n");

  await ensureDir(DIST);
  await ensureDir(join(DIST, "content"));
  await ensureDir(join(DIST, "popup"));
  await ensureDir(join(DIST, "wasm"));

  const [denoResolver, denoLoader] = denoPlugins({ configPath: CONFIG_PATH });

  console.log("1. Building background service worker...");
  await esbuild.build({
    entryPoints: [join(ROOT, "src/background/service-worker.ts")],
    outfile: join(DIST, "background.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    plugins: [denoResolver, denoLoader],
    // WASM binary is loaded via fetch at runtime; JS glue code is bundled
  });

  console.log("2. Building content script (kakuyomu)...");
  await esbuild.build({
    entryPoints: [join(ROOT, "src/content/kakuyomu.ts")],
    outfile: join(DIST, "content/kakuyomu.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    plugins: [denoResolver, denoLoader],
  });

  console.log("3. Building popup...");
  await esbuild.build({
    entryPoints: [join(ROOT, "src/settings/popup.tsx")],
    outfile: join(DIST, "popup/popup.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    jsx: "automatic",
    jsxImportSource: "preact",
    plugins: [denoResolver, denoLoader],
  });

  console.log("4. Copying static files...");
  await Deno.copyFile(join(ROOT, "manifest.json"), join(DIST, "manifest.json"));
  await Deno.copyFile(
    join(ROOT, "src/settings/popup.html"),
    join(DIST, "popup/popup.html"),
  );

  console.log("5. Copying WASM binary...");
  const wasmPath = findWasmBinary();
  console.log(`   Found: ${wasmPath}`);
  await Deno.copyFile(wasmPath, join(DIST, "wasm/lindera_wasm_bg.wasm"));
  const wasmStat = await Deno.stat(join(DIST, "wasm/lindera_wasm_bg.wasm"));
  console.log(`   Size: ${(wasmStat.size / 1024 / 1024).toFixed(1)} MB`);

  esbuild.stop();

  console.log("\n✅ Build complete! Output: dist/");
  console.log("\nFiles:");
  for await (const entry of walkDir(DIST)) {
    const rel = entry.replace(DIST, "dist");
    const stat = await Deno.stat(entry);
    const size = stat.size > 1024 * 1024
      ? `${(stat.size / 1024 / 1024).toFixed(1)} MB`
      : `${(stat.size / 1024).toFixed(1)} KB`;
    console.log(`  ${rel} (${size})`);
  }
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isFile) {
      yield path;
    } else if (entry.isDirectory) {
      yield* walkDir(path);
    }
  }
}

build().catch((err) => {
  console.error("Build failed:", err);
  Deno.exit(1);
});
