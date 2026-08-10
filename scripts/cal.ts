// 較正ループツールの統一入口（純ルーター）。第1引数のサブコマンドを本体（scripts/lib/cal_*）へ
// 委譲するだけで、ロジックは持たない。起動: deno task cal <register|label|tag|exclude|evaluate|list|serve> ...
//
// detail サブコマンドは廃止した。1作品の詳細は list が焼く cal.json からブラウザ側（serve が
// 配信する cal_viewer/app.js）で描画する。

import { runRegister } from "./lib/cal_register.ts";
import { runExclude, runLabel, runTag } from "./lib/cal_labels.ts";
import { runEvaluate, runList } from "./lib/cal_list.ts";
import { runServe } from "./lib/cal_serve.ts";

export type Handler = (args: string[]) => Promise<number>;

export const HANDLERS: Record<string, Handler> = {
  register: runRegister,
  label: runLabel,
  tag: runTag,
  exclude: runExclude,
  evaluate: runEvaluate,
  list: runList,
  serve: runServe,
};

export async function route(
  argv: string[],
  handlers: Record<string, Handler> = HANDLERS,
): Promise<number> {
  const [sub, ...rest] = argv;
  const handler = sub ? handlers[sub] : undefined;
  if (!handler) {
    console.error(
      `未知のサブコマンド: ${sub ?? "(なし)"}\n` +
        `使い方: deno task cal <${Object.keys(handlers).join("|")}> ...`,
    );
    return 1;
  }
  return await handler(rest);
}

if (import.meta.main) {
  Deno.exit(await route(Deno.args));
}
