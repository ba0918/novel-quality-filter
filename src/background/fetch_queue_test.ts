import { assertEquals, assertGreaterOrEqual } from "@std/assert";

Deno.test("fetch-queue logic: tasks execute in FIFO order", async () => {
  const results: number[] = [];
  const queue: (() => Promise<void>)[] = [];

  for (const n of [1, 2, 3]) {
    queue.push(() => {
      results.push(n);
      return Promise.resolve();
    });
  }

  for (const task of queue) {
    await task();
  }

  assertEquals(results, [1, 2, 3]);
});

Deno.test("fetch-queue logic: interval is respected between tasks", async () => {
  const INTERVAL_MS = 50;
  const timestamps: number[] = [];

  async function processWithInterval(tasks: (() => Promise<void>)[]): Promise<void> {
    let lastAt = 0;
    for (const task of tasks) {
      const elapsed = Date.now() - lastAt;
      if (lastAt > 0 && elapsed < INTERVAL_MS) {
        await new Promise((r) => setTimeout(r, INTERVAL_MS - elapsed));
      }
      lastAt = Date.now();
      timestamps.push(lastAt);
      await task();
    }
  }

  const tasks = [1, 2, 3].map((_n) => () => Promise.resolve());

  await processWithInterval(tasks);

  assertEquals(timestamps.length, 3);
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    assertGreaterOrEqual(gap, INTERVAL_MS - 5);
  }
});

Deno.test("fetch-queue logic: rejected task does not block subsequent tasks", async () => {
  const results: string[] = [];
  const tasks: (() => Promise<void>)[] = [
    () => {
      results.push("a");
      return Promise.resolve();
    },
    () => Promise.reject(new Error("fail")),
    () => {
      results.push("c");
      return Promise.resolve();
    },
  ];

  for (const task of tasks) {
    try {
      await task();
    } catch {
      results.push("error");
    }
  }

  assertEquals(results, ["a", "error", "c"]);
});
