// cal_viewer_config の3ケース（正常 / 欠損 / 壊れ）を検証する。
// 実験ツールの設定なので、読めない・壊れている場合もハード fail させずデフォルトへ落ちることを担保する。

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { DEFAULT_VIEWER_CONFIG, loadViewerConfig } from "./cal_viewer_config.ts";

Deno.test("loadViewerConfig: 正常な config はその値をそのまま返す", async () => {
  const base = await Deno.makeTempDir();
  const path = join(base, "config.json");
  try {
    await Deno.writeTextFile(
      path,
      JSON.stringify({ distDir: "custom/dist", port: 9999 }),
    );
    const config = await loadViewerConfig(path);
    assertEquals(config, { distDir: "custom/dist", port: 9999 });
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("loadViewerConfig: config ファイルがなければデフォルト値に落ちる", async () => {
  const base = await Deno.makeTempDir();
  const path = join(base, "does-not-exist.json");
  try {
    const config = await loadViewerConfig(path);
    assertEquals(config, DEFAULT_VIEWER_CONFIG);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("loadViewerConfig: JSON が壊れていれば警告してデフォルト値に落ちる", async () => {
  const base = await Deno.makeTempDir();
  const path = join(base, "config.json");
  const originalError = console.error;
  const warnings: string[] = [];
  console.error = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    await Deno.writeTextFile(path, "{ not valid json");
    const config = await loadViewerConfig(path);
    assertEquals(config, DEFAULT_VIEWER_CONFIG);
    assertEquals(warnings.length > 0, true);
  } finally {
    console.error = originalError;
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("loadViewerConfig: 欠損キーはデフォルト値で補完する", async () => {
  const base = await Deno.makeTempDir();
  const path = join(base, "config.json");
  try {
    await Deno.writeTextFile(path, JSON.stringify({ port: 12345 }));
    const config = await loadViewerConfig(path);
    assertEquals(config, { distDir: DEFAULT_VIEWER_CONFIG.distDir, port: 12345 });
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("loadViewerConfig: 型の合わない値は無視してデフォルトで補完する", async () => {
  const base = await Deno.makeTempDir();
  const path = join(base, "config.json");
  try {
    await Deno.writeTextFile(path, JSON.stringify({ distDir: 123, port: "not-a-number" }));
    const config = await loadViewerConfig(path);
    assertEquals(config, DEFAULT_VIEWER_CONFIG);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});
