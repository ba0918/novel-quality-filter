import { FETCH_INTERVAL_MS } from "../shared/constants.ts";

type Task<T> = {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

const queue: Task<unknown>[] = [];
let processing = false;
let lastFetchAt = 0;

export function enqueue<T>(execute: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ execute, resolve, reject } as Task<unknown>);
    if (!processing) processQueue();
  });
}

async function processQueue(): Promise<void> {
  processing = true;

  while (queue.length > 0) {
    const elapsed = Date.now() - lastFetchAt;
    if (elapsed < FETCH_INTERVAL_MS) {
      await sleep(FETCH_INTERVAL_MS - elapsed);
    }

    const task = queue.shift()!;
    lastFetchAt = Date.now();
    try {
      const result = await task.execute();
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    }
  }

  processing = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
