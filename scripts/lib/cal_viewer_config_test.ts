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

// Deno.serve は不正な port（レンジ外・非整数）に対して RangeError を同期的に投げるため、
// fillDefaults の型チェックだけでは通過してしまう {port: 70000} 等を弾けず「壊れた config は
// 警告 + デフォルト継続」という契約が壊れる。数値レンジと整数性まで検証する。
async function assertInvalidPortFallsBackWithWarning(
  configJson: Record<string, unknown>,
): Promise<void> {
  const base = await Deno.makeTempDir();
  const path = join(base, "config.json");
  const originalError = console.error;
  const warnings: string[] = [];
  console.error = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    await Deno.writeTextFile(path, JSON.stringify(configJson));
    const config = await loadViewerConfig(path);
    assertEquals(config.port, DEFAULT_VIEWER_CONFIG.port);
    assertEquals(warnings.length > 0, true);
  } finally {
    console.error = originalError;
    await Deno.remove(base, { recursive: true });
  }
}

Deno.test("loadViewerConfig: port が範囲外（70000）ならデフォルトへ警告付きで落ちる", async () => {
  await assertInvalidPortFallsBackWithWarning({ port: 70000 });
});

Deno.test("loadViewerConfig: port が負数（-1）ならデフォルトへ警告付きで落ちる", async () => {
  await assertInvalidPortFallsBackWithWarning({ port: -1 });
});

Deno.test("loadViewerConfig: port が非整数（3.14）ならデフォルトへ警告付きで落ちる", async () => {
  await assertInvalidPortFallsBackWithWarning({ port: 3.14 });
});

Deno.test('loadViewerConfig: port が文字列（"8000"）ならデフォルトへ警告付きで落ちる', async () => {
  await assertInvalidPortFallsBackWithWarning({ port: "8000" });
});

Deno.test("loadViewerConfig: distDir が空文字ならデフォルトへ警告付きで落ちる", async () => {
  const base = await Deno.makeTempDir();
  const path = join(base, "config.json");
  const originalError = console.error;
  const warnings: string[] = [];
  console.error = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    await Deno.writeTextFile(path, JSON.stringify({ distDir: "" }));
    const config = await loadViewerConfig(path);
    assertEquals(config.distDir, DEFAULT_VIEWER_CONFIG.distDir);
    assertEquals(warnings.length > 0, true);
  } finally {
    console.error = originalError;
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("loadViewerConfig: port だけ不正でも distDir の指定値は維持される（フィールド単位のフォールバック）", async () => {
  const base = await Deno.makeTempDir();
  const path = join(base, "config.json");
  try {
    await Deno.writeTextFile(path, JSON.stringify({ distDir: "custom/dist", port: 70000 }));
    const config = await loadViewerConfig(path);
    assertEquals(config, { distDir: "custom/dist", port: DEFAULT_VIEWER_CONFIG.port });
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});
