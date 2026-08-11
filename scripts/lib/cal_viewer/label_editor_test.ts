// label_editor.js の純関数部分（fetch の URL 組み立てと body 整形）の Deno テスト。
// DOM 副作用（popover の open/close、focus 制御、toast 呼び出し）は Playwright など
// 実ブラウザ経路の対象なのでここでは対象にしない。URL・body の契約は cal_serve.ts の
// エンドポイント仕様と 1 対 1 で対応させ、ズレが起きたら Deno test 側で検知する。

import { assertEquals } from "@std/assert";
import { deleteLabelRequest, performLabelUpdate, setLabelRequest } from "./label_editor.js";
import { computeNextLabels, primaryChipLabels, primaryLabelValue } from "./label_update.js";

Deno.test("setLabelRequest: POST /labels 用の url/method/body を組み立てる（「駄」）", () => {
  const req = setLabelRequest("kakuyomu:123", "駄");
  assertEquals(req.url, "/labels");
  assertEquals(req.method, "POST");
  assertEquals(req.headers, { "content-type": "application/json" });
  assertEquals(JSON.parse(req.body), { siteWorkId: "kakuyomu:123", value: "駄" });
});

Deno.test("setLabelRequest: value が「良」「対象外」でも同じ形で組み立てる", () => {
  assertEquals(
    JSON.parse(setLabelRequest("kakuyomu:1", "良").body),
    { siteWorkId: "kakuyomu:1", value: "良" },
  );
  assertEquals(
    JSON.parse(setLabelRequest("kakuyomu:2", "対象外").body),
    { siteWorkId: "kakuyomu:2", value: "対象外" },
  );
});

Deno.test("deleteLabelRequest: siteWorkId を encodeURIComponent した DELETE URL を返す", () => {
  const req = deleteLabelRequest("kakuyomu:123");
  // ":" は encodeURIComponent の対象になるためエンコード後の形で比較する。
  // サーバー側 (handleLabelDelete) は decodeURIComponent 後に enum パターンで検証する。
  assertEquals(req.url, `/labels/${encodeURIComponent("kakuyomu:123")}`);
  assertEquals(req.method, "DELETE");
  assertEquals(req.body, undefined);
});

Deno.test("computeNextLabels: 良/駄 選択は quality を上書きし、scope を「対象」へ戻して既存タグを保持する", () => {
  assertEquals(computeNextLabels(["良", "すり抜け"], "駄"), ["駄", "すり抜け"]);
  // 「対象外」から「良」に戻すと scope も戻るので、labelsFor 順序と一致する ["良", ...tags]
  assertEquals(computeNextLabels(["駄", "対象外", "ハードネガティブ"], "良"), [
    "良",
    "ハードネガティブ",
  ]);
});

Deno.test("computeNextLabels: 「対象外」選択は既存 quality を保持する（労力ゼロで再判定に戻せる）", () => {
  // labelsFor が返す並び ["quality?", "対象外"?, ...tags] に合わせて、既存 quality があれば
  // 先頭に残す（labels_store.setLabel の「品質を対象外に混ぜず、quality は保持する」に合わせる）。
  assertEquals(computeNextLabels(["良", "すり抜け"], "対象外"), ["良", "対象外", "すり抜け"]);
  assertEquals(computeNextLabels(["駄", "ハードネガティブ"], "対象外"), [
    "駄",
    "対象外",
    "ハードネガティブ",
  ]);
  // 未ラベルから「対象外」だけ付けるケースは quality なしのまま対象外へ。
  assertEquals(computeNextLabels(["すり抜け"], "対象外"), ["対象外", "すり抜け"]);
  // すでに「対象外」だけの状態からもう一度「対象外」を選んでも同じ結果。
  assertEquals(computeNextLabels(["対象外"], "対象外"), ["対象外"]);
});

Deno.test("computeNextLabels: null は空配列（未ラベルに戻す＝行削除）", () => {
  assertEquals(computeNextLabels(["良", "すり抜け"], null), []);
});

Deno.test("computeNextLabels: 未ラベル（空配列）から品質を付ける", () => {
  assertEquals(computeNextLabels([], "良"), ["良"]);
});

Deno.test("primaryLabelValue: scope 軸を quality より優先し、「対象外」が含まれれば「対象外」を返す", () => {
  // labels_store.labelsFor が ["良", "対象外", ...tags] を返しても、chip は「対象外」を表示する。
  // labels 配列の並びに依存しない（先頭が「良」でも scope 優先）。
  assertEquals(primaryLabelValue(["良", "対象外", "すり抜け"]), "対象外");
  assertEquals(primaryLabelValue(["駄", "対象外"]), "対象外");
  assertEquals(primaryLabelValue(["対象外"]), "対象外");
});

Deno.test("primaryLabelValue: 対象外を含まなければ quality（良/駄）を返す", () => {
  assertEquals(primaryLabelValue(["良"]), "良");
  assertEquals(primaryLabelValue(["駄", "ハードネガティブ"]), "駄");
});

Deno.test("primaryLabelValue: 品質もスコープも無ければ null（未ラベル）", () => {
  assertEquals(primaryLabelValue([]), null);
  assertEquals(primaryLabelValue(["すり抜け"]), null); // タグだけ
});

// サイドバー行 chip は Detail の primary chip と同じ選定規則に揃える
// (docs/spec/calibration-loop-tool.md「サイドバー行の chip も同じ選定規則を適用する」)。
// primaryChipLabels は「サイドバーに描く chip 列」の純関数で、primary が null なら
// 空配列（LabelChips 側で「未」を出す）、そうでなければ [primary] を 1 個だけ返す。

Deno.test("primaryChipLabels: [良+対象外] は scope 優先で「対象外」1 個だけを返す（Detail の primary と一致）", () => {
  assertEquals(primaryChipLabels(["良", "対象外"]), ["対象外"]);
  assertEquals(primaryChipLabels(["良", "対象外", "ハードネガティブ"]), ["対象外"]);
});

Deno.test("primaryChipLabels: 対象外を含まなければ quality（良/駄）を 1 個だけ返し、cal tag タグは含めない", () => {
  assertEquals(primaryChipLabels(["良"]), ["良"]);
  assertEquals(primaryChipLabels(["駄", "すり抜け"]), ["駄"]);
});

Deno.test("primaryChipLabels: primary が無ければ空配列（LabelChips 側で「未」を描く）", () => {
  assertEquals(primaryChipLabels([]), []);
  assertEquals(primaryChipLabels(["すり抜け"]), []); // タグだけは「未」扱い
});

// rollback の正しさ: primary 値だけを持ち回ると、optimistic 更新後の labels 配列を
// 元に computeNextLabels が再計算されて元の配列が復元されない（例: 元 ["良","対象外"]
// で「駄」を選んで失敗 → 現在 ["駄"] を元に「対象外」を戻すと ["駄","対象外"] になり
// silent に quality が「良」→「駄」へ書き換わる）。performLabelUpdate は previousLabels
// スナップショットを持ち回り、失敗時に onRollback(previousLabels) で labels 配列全体を
// 一気に復元する契約にする。

Deno.test("performLabelUpdate: fetch 失敗時に onRollback へ previousLabels 全体を渡して復元させる", async () => {
  const calls: unknown[] = [];
  await performLabelUpdate({
    siteWorkId: "kakuyomu:1",
    nextValue: "駄",
    previousLabels: ["良", "対象外", "ハードネガティブ"],
    fetchImpl: () => Promise.resolve(new Response("nope", { status: 500 })),
    onOptimisticUpdate: (v: string | null) => calls.push(["opt", v]),
    onRollback: (labels: readonly string[]) => calls.push(["rollback", labels]),
    onError: (msg: string) => calls.push(["error", msg]),
  });
  assertEquals(calls, [
    ["opt", "駄"],
    ["rollback", ["良", "対象外", "ハードネガティブ"]],
    ["error", "ラベル更新に失敗しました（HTTP 500）"],
  ]);
});

Deno.test("performLabelUpdate: fetch 成功時は onRollback / onError を呼ばず optimistic 更新のみ", async () => {
  const calls: unknown[] = [];
  await performLabelUpdate({
    siteWorkId: "kakuyomu:1",
    nextValue: "良",
    previousLabels: ["対象外"],
    fetchImpl: () => Promise.resolve(new Response("", { status: 200 })),
    onOptimisticUpdate: (v: string | null) => calls.push(["opt", v]),
    onRollback: (labels: readonly string[]) => calls.push(["rollback", labels]),
    onError: (msg: string) => calls.push(["error", msg]),
  });
  assertEquals(calls, [["opt", "良"]]);
});

Deno.test("performLabelUpdate: nextValue=null (未ラベルに戻す) は DELETE を投げる", async () => {
  const requests: Array<{ url: string; method?: string }> = [];
  await performLabelUpdate({
    siteWorkId: "kakuyomu:xyz",
    nextValue: null,
    previousLabels: ["良"],
    fetchImpl: (url: string, init: RequestInit) => {
      requests.push({ url, method: init.method });
      return Promise.resolve(new Response("", { status: 200 }));
    },
    onOptimisticUpdate: () => {},
    onRollback: () => {},
    onError: () => {},
  });
  assertEquals(requests, [{ url: "/labels/kakuyomu%3Axyz", method: "DELETE" }]);
});

// server 側 handleLabelPost が「labels.jsonl は更新済 + cal.json patch 失敗」を
// 200 + JSON body {warning} で返す（詳細は cal_serve.ts）。この経路は
// - labels.jsonl は正なので rollback すると UI 表示と永続層がむしろズレる
// - でも「cal.json は次回 cal list で解消」を利用者へ知らせる必要はある
// という2条件を同時に満たすため、rollback は呼ばず onWarning だけ呼ぶ契約にする。

Deno.test("performLabelUpdate: 200 + warning JSON body は onWarning へ流し rollback は呼ばない", async () => {
  const calls: unknown[] = [];
  await performLabelUpdate({
    siteWorkId: "kakuyomu:1",
    nextValue: "駄",
    previousLabels: ["良"],
    fetchImpl: () =>
      Promise.resolve(
        new Response(JSON.stringify({ warning: "cal.json 反映に失敗" }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      ),
    onOptimisticUpdate: (v: string | null) => calls.push(["opt", v]),
    onRollback: (labels: readonly string[]) => calls.push(["rollback", labels]),
    onError: (msg: string) => calls.push(["error", msg]),
    onWarning: (msg: string) => calls.push(["warning", msg]),
  });
  assertEquals(calls, [
    ["opt", "駄"],
    ["warning", "cal.json 反映に失敗"],
  ]);
});

Deno.test("performLabelUpdate: onWarning が未指定でも 200+warning body で落ちない（既存呼び出しの後方互換）", async () => {
  const calls: unknown[] = [];
  await performLabelUpdate({
    siteWorkId: "kakuyomu:1",
    nextValue: "駄",
    previousLabels: ["良"],
    fetchImpl: () =>
      Promise.resolve(
        new Response(JSON.stringify({ warning: "cal.json 反映に失敗" }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      ),
    onOptimisticUpdate: (v: string | null) => calls.push(["opt", v]),
    onRollback: (labels: readonly string[]) => calls.push(["rollback", labels]),
    onError: (msg: string) => calls.push(["error", msg]),
  });
  // rollback も error も呼ばれず、optimistic 更新だけで完結する（warning は捨てられる）。
  assertEquals(calls, [["opt", "駄"]]);
});

Deno.test("performLabelUpdate: 200 + 空 body は onWarning を呼ばない（現行の完全成功系）", async () => {
  // 既存の handleLabelPost 完全成功は Response(null, {status: 200}) を返す。
  // content-type が無いので res.json() は走らせない。
  const calls: unknown[] = [];
  await performLabelUpdate({
    siteWorkId: "kakuyomu:1",
    nextValue: "良",
    previousLabels: [],
    fetchImpl: () => Promise.resolve(new Response(null, { status: 200 })),
    onOptimisticUpdate: (v: string | null) => calls.push(["opt", v]),
    onRollback: (labels: readonly string[]) => calls.push(["rollback", labels]),
    onError: (msg: string) => calls.push(["error", msg]),
    onWarning: (msg: string) => calls.push(["warning", msg]),
  });
  assertEquals(calls, [["opt", "良"]]);
});

Deno.test("performLabelUpdate: fetch 例外（network error）も onRollback へ previousLabels を渡す", async () => {
  const calls: unknown[] = [];
  await performLabelUpdate({
    siteWorkId: "kakuyomu:2",
    nextValue: "対象外",
    previousLabels: ["良", "すり抜け"],
    fetchImpl: () => Promise.reject(new Error("network down")),
    onOptimisticUpdate: (v: string | null) => calls.push(["opt", v]),
    onRollback: (labels: readonly string[]) => calls.push(["rollback", labels]),
    onError: (msg: string) => calls.push(["error", msg]),
  });
  assertEquals(calls, [
    ["opt", "対象外"],
    ["rollback", ["良", "すり抜け"]],
    ["error", "ラベル更新に失敗しました（network down）"],
  ]);
});
