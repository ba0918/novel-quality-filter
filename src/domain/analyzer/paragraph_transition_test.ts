import { assert, assertEquals } from "@std/assert";
import { initTokenizer, tokenize } from "../tokenizer/mod.ts";
import { analyzeParagraphTransitions, classifyParagraph } from "./paragraph_transition.ts";

Deno.test({
  name: "paragraph_transition: classify dialogue paragraph",
  async fn() {
    await initTokenizer();
    const text = "「今日はいい天気だね」「そうだね、散歩にでも行こうか」";
    assertEquals(classifyParagraph(text, tokenize), "D");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "paragraph_transition: classify internal paragraph",
  async fn() {
    await initTokenizer();
    const text = "俺はこの状況をどうすべきか考えた。答えは出なかった。";
    assertEquals(classifyParagraph(text, tokenize), "I");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "paragraph_transition: classify narrative/description paragraph",
  async fn() {
    await initTokenizer();
    const text = "白い光が窓から差し込み、冷たい風が部屋を満たしていた。";
    assertEquals(classifyParagraph(text, tokenize), "N");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "paragraph_transition: classify action paragraph",
  async fn() {
    await initTokenizer();
    const text = "男は立ち上がった。椅子を引いて、部屋を出た。";
    assertEquals(classifyParagraph(text, tokenize), "A");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "paragraph_transition: uniform pattern has low entropy",
  async fn() {
    await initTokenizer();
    const lines = [];
    for (let i = 0; i < 6; i++) {
      lines.push("「やあ」「おう」");
      lines.push("白い光と冷たい風が吹いていた。");
      lines.push("俺は何をすべきか考えた。");
    }
    const text = lines.join("\n");
    const result = analyzeParagraphTransitions(text, tokenize);
    assert(
      result.entropy < 1.0,
      `Expected low entropy for uniform pattern, got ${result.entropy}`,
    );
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "paragraph_transition: diverse pattern has higher entropy",
  async fn() {
    await initTokenizer();
    const text = [
      "「やあ」「おう」",
      "男は立ち上がった。椅子を蹴った。",
      "白い光と冷たい風が吹いていた。",
      "俺は何をすべきか考えた。",
      "男は走り出した。ドアを開けた。",
      "「待ってくれ」「何だ」",
      "俺は後悔するかもしれないと思った。",
      "赤い夕陽が差し込む音がした。",
      "男は剣を抜いた。振り下ろした。",
      "「終わりだ」「まだだ」",
      "白い月の光が照らしていた。",
      "男は走り続けた。止まらなかった。",
    ].join("\n");
    const result = analyzeParagraphTransitions(text, tokenize);
    assert(
      result.entropy > 0.5,
      `Expected higher entropy for diverse pattern, got ${result.entropy}`,
    );
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "paragraph_transition: too few paragraphs returns zero",
  async fn() {
    await initTokenizer();
    const result = analyzeParagraphTransitions("一行だけ。", tokenize);
    assertEquals(result.entropy, 0);
    assertEquals(result.types.length, 0);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
