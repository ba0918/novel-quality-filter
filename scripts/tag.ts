// deno task tag <url|workId> <+タグ|-タグ>
// コホート（自然分布/すり抜け/ハードネガティブ等）をタグで付け外しする。

import { toggleTag } from "./lib/labels_store.ts";
import { editLabelStore } from "./lib/labels_cli.ts";

const [target, tagArg] = Deno.args;
if (!target || !tagArg) {
  console.error("使い方: deno task tag <url|workId> <+タグ|-タグ>");
  Deno.exit(1);
}

const id = await editLabelStore(
  target,
  (records, siteWorkId, now) => toggleTag(records, siteWorkId, tagArg, now),
);
console.log(`タグ更新: ${id} ← ${tagArg}`);
