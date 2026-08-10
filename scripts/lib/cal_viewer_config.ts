// cal list / cal serve が共有するビューア設定（distDir・port）。実体は
// .agents/runtime/cal-viewer/config.json（gitignore 済み）。実験ツールの設定なので、
// ファイルが無い・壊れている場合もハード fail させず警告してデフォルト値へ落ちる。

export interface ViewerConfig {
  distDir: string;
  port: number;
}

export const DEFAULT_VIEWER_CONFIG: ViewerConfig = {
  distDir: ".agents/runtime/cal-viewer/dist",
  port: 8000,
};

export const VIEWER_CONFIG_PATH = ".agents/runtime/cal-viewer/config.json";

export async function loadViewerConfig(
  path: string = VIEWER_CONFIG_PATH,
): Promise<ViewerConfig> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return DEFAULT_VIEWER_CONFIG;
    console.error(`cal-viewer config の読み込みに失敗しました。デフォルト値で続行します: ${e}`);
    return DEFAULT_VIEWER_CONFIG;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error(`cal-viewer config の JSON 解析に失敗しました。デフォルト値で続行します: ${e}`);
    return DEFAULT_VIEWER_CONFIG;
  }

  return fillDefaults(parsed);
}

function isValidDistDir(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

// Deno.serve は範囲外・非整数の port に対して RangeError を同期的に投げる。fillDefaults の
// 型チェックだけでは {port: 70000} のような値を弾けず、「壊れた config は警告 + デフォルト
// 継続」という契約より先に serve が落ちてしまうため、レンジと整数性まで検証する。
function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

function fillDefaults(parsed: unknown): ViewerConfig {
  const obj = (parsed && typeof parsed === "object") ? parsed as Record<string, unknown> : {};

  if ("distDir" in obj && !isValidDistDir(obj.distDir)) {
    console.error(
      `cal-viewer config の distDir が不正です。デフォルト値で続行します: ${
        JSON.stringify(obj.distDir)
      }`,
    );
  }
  if ("port" in obj && !isValidPort(obj.port)) {
    console.error(
      `cal-viewer config の port が不正です（1-65535 の整数を指定）。デフォルト値で続行します: ${
        JSON.stringify(obj.port)
      }`,
    );
  }

  const distDir = isValidDistDir(obj.distDir) ? obj.distDir : DEFAULT_VIEWER_CONFIG.distDir;
  const port = isValidPort(obj.port) ? obj.port : DEFAULT_VIEWER_CONFIG.port;
  return { distDir, port };
}
