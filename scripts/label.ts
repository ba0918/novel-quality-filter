// deno task label <url|workId> <良|ゴミ|対象外> [note]
// 品質軸（良/ゴミ）またはスコープ軸（対象外）のラベルを付与する。手JSON編集の代替。

import { setLabel } from "./lib/labels_store.ts";
import { editLabelStore } from "./lib/labels_cli.ts";

const [target, value, note] = Deno.args;
if (!target || (value !== "良" && value !== "ゴミ" && value !== "対象外")) {
  console.error("使い方: deno task label <url|workId> <良|ゴミ|対象外> [note]");
  Deno.exit(1);
}

const id = await editLabelStore(
  target,
  (records, siteWorkId, now) => setLabel(records, siteWorkId, value, now, note),
);
console.log(`ラベル付与: ${id} ← ${value}${note ? `（${note}）` : ""}`);
