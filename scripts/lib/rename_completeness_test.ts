// 「ゴミ」→「駄」改名の完全性をリポジトリ横断で機械保証する。改名以降に旧表記が
// 忍び込むと UI と CLI で二重に扱う羽目になるため、grep ベースの gate を CI に載せる。
// 旧表記が残ってよいのは backward-compat の legacy 変換経路とその対にあるテスト
// だけで、それ以外の全てのファイルは 0 件でなければならない。
//
// scripts/, src/, docs/spec/ を対象にする（docs/ 全体は idea メモや wrap 記録に
// 由来する経緯が残るのでガード対象外）。

import { assert, assertEquals } from "@std/assert";
import { walk } from "@std/fs";

const ROOTS = ["scripts", "src", "docs/spec"];
const NEEDLE = "ゴミ";

// 旧表記の存在が正当なファイル（legacy 変換経路とその対のテスト、および経緯を
// 記録するコメント）。ここに載っていないファイルで "ゴミ" が見つかったら失敗する。
const LEGACY_ALLOWLIST = new Set([
  "scripts/lib/labels_store.ts", // normalizeLegacy の "ゴミ"→"駄" マッピング
  "scripts/lib/labels_store_test.ts", // legacy 移行を担保するテスト
  "scripts/lib/cal_labels_test.ts", // 旧表記が非零 exit で拒否されることを検証
  "scripts/lib/cal_serve_test.ts", // POST /labels が旧表記を 400 で拒否することを検証
  "scripts/lib/dataset.ts", // LabelRecord.label の legacy 経緯コメント
  "scripts/lib/rename_completeness_test.ts", // このガード自体
]);

async function collectHits(): Promise<{ file: string; line: number; text: string }[]> {
  const hits: { file: string; line: number; text: string }[] = [];
  for (const root of ROOTS) {
    for await (
      const entry of walk(root, {
        includeDirs: false,
        skip: [/node_modules/, /\.agents\//],
      })
    ) {
      const text = await Deno.readTextFile(entry.path);
      if (!text.includes(NEEDLE)) continue;
      text.split("\n").forEach((line, idx) => {
        if (line.includes(NEEDLE)) {
          hits.push({ file: entry.path, line: idx + 1, text: line });
        }
      });
    }
  }
  return hits;
}

Deno.test("rename gate: 「ゴミ」参照は legacy 変換経路の allowlist 内でのみ許可される", async () => {
  const hits = await collectHits();
  const violations = hits.filter((h) => !LEGACY_ALLOWLIST.has(h.file));
  if (violations.length > 0) {
    const lines = violations.map((v) => `  ${v.file}:${v.line}  ${v.text.trim()}`).join("\n");
    assert(
      false,
      `改名漏れ (「ゴミ」残存):\n${lines}\n\n` +
        `新規に legacy 経路のファイルを増やした場合は LEGACY_ALLOWLIST を更新すること。`,
    );
  }
});

Deno.test("rename gate: docs/spec/ には「ゴミ」参照が 1 件も残らない", async () => {
  const hits: string[] = [];
  for await (
    const entry of walk("docs/spec", {
      includeDirs: false,
    })
  ) {
    const text = await Deno.readTextFile(entry.path);
    if (text.includes(NEEDLE)) hits.push(entry.path);
  }
  assertEquals(hits, []);
});
