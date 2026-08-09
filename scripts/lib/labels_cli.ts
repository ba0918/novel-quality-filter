// label / tag / exclude の各 CLI が共有する編集ゲート。作品が dataset に収集済みであることを
// 検証してから labels.jsonl を更新する（未収集の作品にラベルを付けない＝存在検証）。純粋な更新
// ロジックは labels_store の各関数に委ね、ここはファイル入出力と存在検証の結線に徹する。

import { loadDataset } from "./dataset.ts";
import {
  datasetSiteWorkIds,
  type LabelRecord2,
  loadLabels2,
  resolveSiteWorkId,
  saveLabels2,
} from "./labels_store.ts";

export const DEFAULT_OUT = ".agents/runtime/dataset.jsonl";
export const DEFAULT_LABELS = ".agents/runtime/labels.jsonl";

export interface EditPaths {
  datasetPath: string;
  labelsPath: string;
}

export type LabelMutation = (
  records: LabelRecord2[],
  siteWorkId: string,
  now: string,
) => LabelRecord2[];

export async function editLabelStore(
  target: string,
  mutate: LabelMutation,
  paths: EditPaths = { datasetPath: DEFAULT_OUT, labelsPath: DEFAULT_LABELS },
): Promise<string> {
  const siteWorkId = resolveSiteWorkId(target);
  const known = datasetSiteWorkIds(await loadDataset(paths.datasetPath));
  if (!known.has(siteWorkId)) {
    throw new Error(`未収集の作品: ${siteWorkId}（先に deno task collect してください）`);
  }
  const labels = await loadLabels2(paths.labelsPath);
  const updated = mutate(labels, siteWorkId, new Date().toISOString());
  await saveLabels2(paths.labelsPath, updated);
  return siteWorkId;
}
