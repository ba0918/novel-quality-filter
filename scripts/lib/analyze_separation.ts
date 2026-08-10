// dataset レコードに品質ラベルを join し、cal list/evaluate 用の JoinedRecord を作る。
// 同一作品の複数スナップショット（--recapture 追記）は最新1件へ畳み、1作品1票にする。

import type { DatasetRecord } from "./dataset.ts";
import { siteWorkId as makeSiteWorkId } from "./capture_store.ts";
import type { LabelRecord2 } from "./labels_store.ts";

export interface JoinedRecord {
  record: DatasetRecord;
  label?: LabelRecord2;
}

export function joinLabels(records: DatasetRecord[], labels: LabelRecord2[]): JoinedRecord[] {
  const byId = new Map(labels.map((l) => [l.siteWorkId, l]));
  return dedupeByWork(records).map((record) => ({ record, label: byId.get(keyOf(record)) }));
}

// 同一作品の重複レコード（--recapture で追記された別スナップショット）は最新1件に畳む。
// 追記順＝取得順なので後勝ちで最新を残す。1作品1票にして二重計上を防ぐ。
function dedupeByWork(records: DatasetRecord[]): DatasetRecord[] {
  const byId = new Map<string, DatasetRecord>();
  for (const r of records) byId.set(keyOf(r), r);
  return [...byId.values()];
}

function keyOf(record: DatasetRecord): string {
  return record.siteWorkId ?? makeSiteWorkId("kakuyomu", record.workId);
}
