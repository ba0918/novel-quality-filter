import { assertEquals } from "@std/assert";
import { type Handler, HANDLERS, route } from "./cal.ts";

Deno.test("HANDLERS: 4機能＋ラベル操作の全サブコマンドを公開する（detail は廃止、serve が加わる）", () => {
  assertEquals(
    Object.keys(HANDLERS).sort(),
    ["evaluate", "exclude", "label", "list", "register", "serve", "tag"],
  );
});

Deno.test("route: 既知サブコマンドへ残り引数を渡して委譲し、返り値のコードを返す", async () => {
  const calls: Array<{ name: string; args: string[] }> = [];
  const handler = (name: string): Handler => (args) => {
    calls.push({ name, args });
    return Promise.resolve(0);
  };
  const handlers = { register: handler("register"), list: handler("list") };

  const code = await route(["register", "111", "--tag", "x"], handlers);
  assertEquals(code, 0);
  assertEquals(calls, [{ name: "register", args: ["111", "--tag", "x"] }]);
});

Deno.test("route: 未知サブコマンドはハンドラを呼ばずエラー終了する", async () => {
  let called = false;
  const handlers = {
    register: () => {
      called = true;
      return Promise.resolve(0);
    },
  };
  const code = await route(["bogus"], handlers);
  assertEquals(code, 1);
  assertEquals(called, false);
});

Deno.test("route: サブコマンド未指定はエラー終了する", async () => {
  const code = await route([], {});
  assertEquals(code, 1);
});

Deno.test("route: ハンドラの返すコードをそのまま伝播する", async () => {
  const handlers = { list: () => Promise.resolve(3) };
  assertEquals(await route(["list"], handlers), 3);
});
