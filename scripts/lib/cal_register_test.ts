import { assertEquals, assertThrows } from "@std/assert";
import { parseRegisterArgs, resolveWorkId } from "./cal_register.ts";

Deno.test("resolveWorkId: 数値IDと作品URLを作品IDへ正規化する", () => {
  assertEquals(resolveWorkId("1234567"), "1234567");
  assertEquals(resolveWorkId("https://kakuyomu.jp/works/1234567"), "1234567");
  assertEquals(resolveWorkId("https://kakuyomu.jp/works/1234567/episodes/99"), "1234567");
});

Deno.test("resolveWorkId: 数値にならない入力を弾く（パス汚染防止のガード）", () => {
  assertThrows(() => resolveWorkId("../etc/passwd"));
  assertThrows(() => resolveWorkId("abc"));
});

Deno.test("parseRegisterArgs: ターゲットとフラグを分離する", () => {
  const opts = parseRegisterArgs([
    "111",
    "--tag",
    "自然分布",
    "222",
    "--interval",
    "3000",
    "--recapture",
  ]);
  assertEquals(opts.targets, ["111", "222"]);
  assertEquals(opts.tags, ["自然分布"]);
  assertEquals(opts.interval, 3000);
  assertEquals(opts.recapture, true);
});

Deno.test("parseRegisterArgs: 既定値はフラグ無指定で埋まる", () => {
  const opts = parseRegisterArgs(["111"]);
  assertEquals(opts.targets, ["111"]);
  assertEquals(opts.tags, []);
  assertEquals(opts.recapture, false);
  assertEquals(opts.out, ".agents/runtime/dataset.jsonl");
});
