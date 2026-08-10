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

function fillDefaults(parsed: unknown): ViewerConfig {
  const obj = (parsed && typeof parsed === "object") ? parsed as Record<string, unknown> : {};
  const distDir = typeof obj.distDir === "string" ? obj.distDir : DEFAULT_VIEWER_CONFIG.distDir;
  const port = typeof obj.port === "number" ? obj.port : DEFAULT_VIEWER_CONFIG.port;
  return { distDir, port };
}
