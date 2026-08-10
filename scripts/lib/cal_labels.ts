// cal label / tag / exclude サブコマンド: ユーザーの主観判定（品質・スコープ・タグ・論理除外）を
// labels.jsonl へ書く薄い入口。純粋な更新は labels_store の各関数、収集済みかの存在検証と入出力の
// 結線は labels_cli.editLabelStore に委ね、ここは引数の解釈と委譲だけを担う。

import { setExcluded, setLabel, toggleTag } from "./labels_store.ts";
import { DEFAULT_LABELS, DEFAULT_OUT, editLabelStore, type EditPaths } from "./labels_cli.ts";

const DEFAULT_PATHS: EditPaths = { datasetPath: DEFAULT_OUT, labelsPath: DEFAULT_LABELS };

export async function runLabel(argv: string[], paths: EditPaths = DEFAULT_PATHS): Promise<number> {
  const [target, value, note] = argv;
  if (!target || (value !== "良" && value !== "駄" && value !== "対象外")) {
    console.error("使い方: deno task cal label <url|workId> <良|駄|対象外> [note]");
    return 1;
  }
  const id = await editLabelStore(
    target,
    (records, siteWorkId, now) => setLabel(records, siteWorkId, value, now, note),
    paths,
  );
  console.log(`ラベル付与: ${id} ← ${value}${note ? `（${note}）` : ""}`);
  return 0;
}

export async function runTag(argv: string[], paths: EditPaths = DEFAULT_PATHS): Promise<number> {
  const [target, tagArg] = argv;
  if (!target || !tagArg) {
    console.error("使い方: deno task cal tag <url|workId> <+タグ|-タグ>");
    return 1;
  }
  const id = await editLabelStore(
    target,
    (records, siteWorkId, now) => toggleTag(records, siteWorkId, tagArg, now),
    paths,
  );
  console.log(`タグ更新: ${id} ← ${tagArg}`);
  return 0;
}

export async function runExclude(
  argv: string[],
  paths: EditPaths = DEFAULT_PATHS,
): Promise<number> {
  const rest = argv.filter((a) => a !== "--undo");
  const undo = argv.includes("--undo");
  const [target] = rest;
  if (!target) {
    console.error("使い方: deno task cal exclude <url|workId> [--undo]");
    return 1;
  }
  const id = await editLabelStore(
    target,
    (records, siteWorkId, now) => setExcluded(records, siteWorkId, !undo, now),
    paths,
  );
  console.log(`${undo ? "除外解除" : "論理除外"}: ${id}`);
  return 0;
}
