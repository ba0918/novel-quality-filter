import { assert, assertAlmostEquals } from "@std/assert";
import { analyzeLogicalConnectives } from "./logical_connective.ts";

Deno.test({
  name: "logical_connective: essay-like text has high density",
  fn() {
    const text =
      "しかし問題はそこではない。したがって別の方法を考える必要がある。つまり根本的な見直しが求められる。さらに時間的な制約もある。";
    const result = analyzeLogicalConnectives(text);
    assert(
      result.density >= 0.5,
      `Expected high density, got ${result.density}`,
    );
    assert(result.count >= 3, `Expected >= 3 connectives, got ${result.count}`);
  },
});

Deno.test({
  name: "logical_connective: narrative text has low density",
  fn() {
    const text =
      "男は立ち上がった。窓を開けると、冷たい風が吹き込んできた。遠くで犬が吠えている。月が雲間から顔を出した。";
    const result = analyzeLogicalConnectives(text);
    assert(
      result.density < 0.2,
      `Expected low density, got ${result.density}`,
    );
  },
});

Deno.test({
  name: "logical_connective: dialogue connectives are excluded",
  fn() {
    const text = "「しかしそれは間違いだ。つまり君が悪い」と彼は言った。男は黙って頷いた。";
    const result = analyzeLogicalConnectives(text);
    assert(
      result.density < 0.5,
      `Dialogue should be excluded, got density ${result.density}`,
    );
  },
});

Deno.test({
  name: "logical_connective: mid-sentence connectives are detected",
  fn() {
    const text = "状況は悪化していた、しかし彼は諦めなかった。結果は出ていた、つまり成功だった。";
    const result = analyzeLogicalConnectives(text);
    assert(result.count >= 2, `Expected >= 2 connectives, got ${result.count}`);
  },
});

Deno.test({
  name: "logical_connective: empty text returns zero",
  fn() {
    const result = analyzeLogicalConnectives("");
    assertAlmostEquals(result.density, 0);
    assert(result.sentenceCount === 0);
  },
});
