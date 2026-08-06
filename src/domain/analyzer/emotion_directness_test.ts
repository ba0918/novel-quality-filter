import { assert, assertAlmostEquals } from "@std/assert";
import { initTokenizer, tokenize } from "../tokenizer/mod.ts";
import { analyzeEmotionDirectness } from "./emotion_directness.ts";

Deno.test({
  name: "emotion_directness: tell-heavy text has high ratio",
  async fn() {
    await initTokenizer();
    const text = "彼は悲しかった。不安が胸を締め付けた。恐怖を感じた。彼女も寂しいと思った。";
    const result = analyzeEmotionDirectness(text, tokenize);
    assert(result.ratio > 0.05, `Expected high ratio, got ${result.ratio}`);
    assert(result.emotionCount > 0, "Should detect emotion words");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "emotion_directness: show-oriented text has low ratio",
  async fn() {
    await initTokenizer();
    const text =
      "拳を握りしめた。唇を噛んで、視線を逸らした。足元の砂利を蹴り上げる。背中を丸めて、路地裏へと歩き出した。";
    const result = analyzeEmotionDirectness(text, tokenize);
    assert(result.ratio < 0.05, `Expected low ratio, got ${result.ratio}`);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "emotion_directness: dialogue is excluded from analysis",
  async fn() {
    await initTokenizer();
    const text = "「悲しいよ。寂しいよ。怖いよ」と彼女は言った。窓の外では雨が降っていた。";
    const result = analyzeEmotionDirectness(text, tokenize);
    assert(
      result.ratio < 0.1,
      `Dialogue emotions should be excluded, got ratio ${result.ratio}`,
    );
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "emotion_directness: empty text returns zero",
  fn() {
    const result = analyzeEmotionDirectness("", (_s) => []);
    assertAlmostEquals(result.ratio, 0);
    assert(result.contentCount === 0);
  },
});

Deno.test({
  name: "emotion_directness: all-dialogue text returns zero",
  fn() {
    const text = "「今日はいい天気だね」「そうだね」";
    const result = analyzeEmotionDirectness(text, (_s) => []);
    assertAlmostEquals(result.ratio, 0);
  },
});
