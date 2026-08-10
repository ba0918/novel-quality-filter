// cal detail サブコマンド: 1作品ぶんの分析票を本番拡張と同体裁の HTML で出す。スコアは
// record.score でなく rawMetrics から式で再計算する（--experiment で実験式に切替）。

import { loadDataset } from "./dataset.ts";
import { resolveSiteWorkId } from "./labels_store.ts";
import { CANONICAL_FORMULA, evaluateRecord, EXPERIMENT_FORMULA } from "./cal_evaluate.ts";
import { type DossierMeta, renderDossierCard, renderHtmlPage } from "./render_dossier.ts";
import type { DatasetRecord } from "./dataset.ts";
import { DEFAULT_LABELS, DEFAULT_OUT } from "./labels_cli.ts";
import { siteWorkId as makeSiteWorkId } from "./capture_store.ts";

export interface ViewPaths {
  datasetPath: string;
  labelsPath: string;
}

const DEFAULT_PATHS: ViewPaths = { datasetPath: DEFAULT_OUT, labelsPath: DEFAULT_LABELS };

export function recordToDossierMeta(record: DatasetRecord): DossierMeta {
  return {
    title: record.title,
    author: record.author,
    url: record.url,
    reviewCount: record.reviewCount,
    totalReviewPoint: record.totalReviewPoint,
    totalCharacterCount: record.totalCharacterCount,
  };
}

function keyOf(record: DatasetRecord): string {
  return record.siteWorkId ?? makeSiteWorkId("kakuyomu", record.workId);
}

export function findRecord(records: DatasetRecord[], target: string): DatasetRecord | undefined {
  const siteWorkId = resolveSiteWorkId(target);
  // 追記順＝取得順。同一作品の複数スナップショットは最新（後勝ち）を返す。
  let found: DatasetRecord | undefined;
  for (const r of records) if (keyOf(r) === siteWorkId) found = r;
  return found;
}

export function renderDetailHtml(record: DatasetRecord, useExperiment: boolean): string {
  const formula = useExperiment ? EXPERIMENT_FORMULA : CANONICAL_FORMULA;
  const result = evaluateRecord(record, formula);
  const label = useExperiment ? "実験式" : "正本";
  const card = renderDossierCard(recordToDossierMeta(record), result);
  return renderHtmlPage(`${record.title} — ${label}`, card);
}

export async function runDetail(argv: string[], paths: ViewPaths = DEFAULT_PATHS): Promise<number> {
  const useExperiment = argv.includes("--experiment");
  const rest = argv.filter((a) => a !== "--experiment");
  const outIdx = rest.indexOf("--out");
  const out = outIdx >= 0 ? rest[outIdx + 1] : undefined;
  const target = rest.find((a, i) => a !== "--out" && rest[i - 1] !== "--out");
  if (!target) {
    console.error("使い方: deno task cal detail <url|workId> [--experiment] [--out PATH]");
    return 1;
  }

  const record = findRecord(await loadDataset(paths.datasetPath), target);
  if (!record) {
    console.error(`未収集の作品: ${target}（先に deno task cal register してください）`);
    return 1;
  }

  const html = renderDetailHtml(record, useExperiment);
  if (out) {
    await Deno.writeTextFile(out, html);
    console.log(`詳細票を書き出しました: ${out}`);
  } else {
    console.log(html);
  }
  return 0;
}
