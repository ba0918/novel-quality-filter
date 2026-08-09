import type { MetricResult, OpeningFormat, PenaltyResult } from "../domain/types.ts";
import { DB_NAME, DB_VERSION, STORE_SCORES } from "./constants.ts";

export interface CachedScore {
  workId: string;
  score: number;
  metrics: MetricResult[];
  penalties: PenaltyResult[];
  openingType?: OpeningFormat;
  sampledCount?: number;
  schemaVersion: number;
  scoredAt: number;
  episodeUrl: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SCORES)) {
        db.createObjectStore(STORE_SCORES, { keyPath: "workId" });
      }

      // v1 → v2: 既存レコードに schemaVersion=1, penalties=[] を設定
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (oldVersion < 2) {
        const tx = request.transaction!;
        const store = tx.objectStore(STORE_SCORES);
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            const record = cursor.value;
            if (record.schemaVersion === undefined) {
              record.schemaVersion = 1;
            }
            if (record.penalties === undefined) {
              record.penalties = [];
            }
            cursor.update(record);
            cursor.continue();
          }
        };
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.addEventListener("close", () => {
        dbPromise = null;
      });
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };

    request.onblocked = () => {
      dbPromise = null;
      reject(new Error("IndexedDB open blocked by another connection"));
    };
  });

  return dbPromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getScore(workId: string): Promise<CachedScore | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORE_SCORES, "readonly");
  const store = tx.objectStore(STORE_SCORES);
  const result = await requestResult(store.get(workId));
  return result ?? undefined;
}

export async function putScore(entry: CachedScore): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_SCORES, "readwrite");
  const store = tx.objectStore(STORE_SCORES);
  await requestResult(store.put(entry));
}

export async function deleteScore(workId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_SCORES, "readwrite");
  const store = tx.objectStore(STORE_SCORES);
  await requestResult(store.delete(workId));
}

export async function clearAll(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_SCORES, "readwrite");
  const store = tx.objectStore(STORE_SCORES);
  await requestResult(store.clear());
}
