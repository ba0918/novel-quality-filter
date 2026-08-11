import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { atomicWriteText } from "./atomic_write.ts";

Deno.test("atomicWriteText: 新規ファイルに書き込む", async () => {
  const base = await Deno.makeTempDir();
  try {
    const path = join(base, "out.txt");
    await atomicWriteText(path, "hello");
    assertEquals(await Deno.readTextFile(path), "hello");
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("atomicWriteText: 既存ファイルを上書きする", async () => {
  const base = await Deno.makeTempDir();
  try {
    const path = join(base, "out.txt");
    await Deno.writeTextFile(path, "old");
    await atomicWriteText(path, "new");
    assertEquals(await Deno.readTextFile(path), "new");
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("atomicWriteText: 書き込み後に .tmp.* ファイルが残らない", async () => {
  const base = await Deno.makeTempDir();
  try {
    const path = join(base, "out.txt");
    await atomicWriteText(path, "x");
    const remaining: string[] = [];
    for await (const entry of Deno.readDir(base)) remaining.push(entry.name);
    assertEquals(remaining, ["out.txt"]);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("atomicWriteText: 書き込み先ディレクトリが存在しなければ例外を投げ、tmp を残さない", async () => {
  const base = await Deno.makeTempDir();
  try {
    const path = join(base, "no-such-dir", "out.txt");
    await assertRejects(() => atomicWriteText(path, "x"));
    // base 自体には .tmp が残っていないこと（残骸を残さない）。
    for await (const entry of Deno.readDir(base)) {
      assert(!entry.name.includes(".tmp."), `unexpected leftover: ${entry.name}`);
    }
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});
