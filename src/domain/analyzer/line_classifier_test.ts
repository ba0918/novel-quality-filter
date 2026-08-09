import { assertEquals } from "@std/assert";
import { classifyLine } from "./line_classifier.ts";

Deno.test("classifyLine: blank クラスの行を空行に分類する", () => {
  assertEquals(classifyLine({ text: "", isBlank: true }), "blank");
});

Deno.test("classifyLine: ダッシュ連続を区切り線に分類する", () => {
  assertEquals(classifyLine({ text: "――――――――", isBlank: false }), "separator");
});

Deno.test("classifyLine: 行頭が【のステータス見出しを確定メタに分類する", () => {
  assertEquals(classifyLine({ text: "【名前】鮫島 武男", isBlank: false }), "meta");
});

Deno.test("classifyLine: 行頭が《のステータス行を確定メタに分類する", () => {
  assertEquals(classifyLine({ text: "《ＨＰ》２５／２５", isBlank: false }), "meta");
});

Deno.test("classifyLine: 末尾が『』でもメタをセリフより優先する", () => {
  // ステータス行 `【レベル】…『９５』` は末尾が 』 だが行頭が【なのでメタ。
  assertEquals(classifyLine({ text: "【レベル】現在値『９５』", isBlank: false }), "meta");
});

Deno.test("classifyLine: ～で全体を囲んだ見出しを確定メタに分類する", () => {
  assertEquals(classifyLine({ text: "～入学初日～", isBlank: false }), "meta");
});

Deno.test("classifyLine: 文中の【】を持つ地の文はメタにしない（行頭判定）", () => {
  assertEquals(classifyLine({ text: "彼は【勇者】と呼ばれた。", isBlank: false }), "narrative");
});

Deno.test("classifyLine: 話者名付き脚本形式をセリフに分類する", () => {
  assertEquals(classifyLine({ text: "カイト 「痛いよ……」", isBlank: false }), "dialogue");
});

Deno.test("classifyLine: 末尾が」の行をセリフに分類する", () => {
  assertEquals(classifyLine({ text: "「痛いよ」", isBlank: false }), "dialogue");
});

Deno.test("classifyLine: 括弧内心（…）を非文末行に分類する", () => {
  assertEquals(classifyLine({ text: "（死にたくないな……）", isBlank: false }), "non-terminal");
});

Deno.test("classifyLine: 句点で終わる通常の行を地の文に分類する", () => {
  assertEquals(classifyLine({ text: "静かな朝だった。", isBlank: false }), "narrative");
});
