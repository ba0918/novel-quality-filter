// deno task exclude <url|workId> [--undo]
// 論理除外フラグを立てる/外す。分析対象から外すだけで、保存済みの生HTML（原本）は消さない。

import { setExcluded } from "./lib/labels_store.ts";
import { editLabelStore } from "./lib/labels_cli.ts";

const args = Deno.args.filter((a) => a !== "--undo");
const undo = Deno.args.includes("--undo");
const [target] = args;
if (!target) {
  console.error("使い方: deno task exclude <url|workId> [--undo]");
  Deno.exit(1);
}

const id = await editLabelStore(
  target,
  (records, siteWorkId, now) => setExcluded(records, siteWorkId, !undo, now),
);
console.log(`${undo ? "除外解除" : "論理除外"}: ${id}`);
