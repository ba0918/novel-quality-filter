// label_editor.js の純関数部分（fetch の URL 組み立てと body 整形）の Deno テスト。
// DOM 副作用（popover の open/close、focus 制御、toast 呼び出し）は Playwright など
// 実ブラウザ経路の対象なのでここでは対象にしない。URL・body の契約は cal_serve.ts の
// エンドポイント仕様と 1 対 1 で対応させ、ズレが起きたら Deno test 側で検知する。

import { assertEquals } from "@std/assert";
import { deleteLabelRequest, setLabelRequest } from "./label_editor.js";
import { computeNextLabels, primaryLabelValue } from "./label_update.js";

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
