// cal list / evaluate サブコマンド。dataset と labels を join し、各作品を正本式と実験式の
// 両方で再計算して「良/悪ラベル・正本スコア・実験スコア・差分」を並べる。較正ループの中心画面。
// スコアは常に rawMetrics からの再計算値で、収集時に保存した record.score は使わない。

import { loadDataset } from "./dataset.ts";
import type { DatasetRecord } from "./dataset.ts";
import { loadLabels2 } from "./labels_store.ts";
import type { LabelRecord2, Quality } from "./labels_store.ts";
import { joinLabels } from "./analyze_separation.ts";
import { CANONICAL_FORMULA, evaluateRecord, EXPERIMENT_FORMULA } from "./cal_evaluate.ts";
import { escapeHtml } from "../../src/domain/analyzer/dossier_format.ts";
import { renderDossierCard, renderHtmlPage } from "./render_dossier.ts";
import { recordToDossierMeta, type ViewPaths } from "./cal_detail.ts";
import { DEFAULT_LABELS, DEFAULT_OUT } from "./labels_cli.ts";

const DEFAULT_PATHS: ViewPaths = { datasetPath: DEFAULT_OUT, labelsPath: DEFAULT_LABELS };
const DEFAULT_LIST_OUT = ".agents/runtime/cal-list.html";

export interface ComparisonRow {
  record: DatasetRecord;
  quality?: Quality;
  scope: string;
  canonicalScore: number;
  experimentScore: number;
  diff: number;
}

export function buildComparisonRows(
  records: DatasetRecord[],
  labels: LabelRecord2[],
): ComparisonRow[] {
  return joinLabels(records, labels).map(({ record, label }) => {
    const canonicalScore = evaluateRecord(record, CANONICAL_FORMULA).score;
    const experimentScore = evaluateRecord(record, EXPERIMENT_FORMULA).score;
    return {
      record,
      quality: label?.quality,
      scope: label?.scope ?? "対象",
      canonicalScore,
      experimentScore,
      diff: experimentScore - canonicalScore,
    };
  });
}

function diffCell(diff: number): string {
  if (diff > 0) return `<td class="nqf-up">+${diff}</td>`;
  if (diff < 0) return `<td class="nqf-down">${diff}</td>`;
  return `<td>0</td>`;
}

export function renderListHtml(rows: ComparisonRow[]): string {
  // ラベル付き（良/ゴミ）を先に、次にスコア差分の大きい順で並べる（較正の注目点を上へ）。
  const sorted = [...rows].sort((a, b) => {
    const la = a.quality ? 0 : 1;
    const lb = b.quality ? 0 : 1;
    if (la !== lb) return la - lb;
    return b.diff - a.diff;
  });

  const header = `<tr><th>作品</th><th>ラベル</th><th>正本</th><th>実験</th><th>差分</th></tr>`;
  const body = sorted.map((row) => {
    const r = row.record;
    return `<tr>` +
      `<td><a href="#${escapeHtml(r.workId)}">${escapeHtml(r.title)}</a></td>` +
      `<td>${row.quality ?? "-"}</td>` +
      `<td>${row.canonicalScore}</td>` +
      `<td>${row.experimentScore}</td>` +
      diffCell(row.diff) +
      `</tr>`;
  }).join("\n");

  const table = `<table class="nqf-cmp">${header}${body}</table>`;

  // 各行から開ける詳細カード（実験式で再計算した分析票）。
  const cards = sorted.map((row) => {
    const card = renderDossierCard(
      recordToDossierMeta(row.record),
      evaluateRecord(row.record, EXPERIMENT_FORMULA),
    );
    return `<div id="${escapeHtml(row.record.workId)}">${card}</div>`;
  }).join("\n");

  const summary = `<p>${rows.length}作品（良 ${rows.filter((r) => r.quality === "良").length} / ` +
    `ゴミ ${rows.filter((r) => r.quality === "ゴミ").length}）。正本式 vs 実験式の比較。</p>`;

  return renderHtmlPage("較正一覧", `<h1>較正一覧</h1>${summary}${table}<h2>詳細</h2>${cards}`);
}

async function loadRows(paths: ViewPaths): Promise<ComparisonRow[]> {
  const records = await loadDataset(paths.datasetPath);
  const labels = await loadLabels2(paths.labelsPath);
  return buildComparisonRows(records, labels);
}

export async function runList(argv: string[], paths: ViewPaths = DEFAULT_PATHS): Promise<number> {
  const outIdx = argv.indexOf("--out");
  const out = outIdx >= 0 ? argv[outIdx + 1] : DEFAULT_LIST_OUT;
  const rows = await loadRows(paths);
  if (rows.length === 0) {
    console.error("データセットが空です（先に deno task cal register してください）");
    return 1;
  }
  await Deno.writeTextFile(out, renderListHtml(rows));
  console.log(`一覧を書き出しました: ${out}（${rows.length}作品）`);
  return 0;
}

export async function runEvaluate(
  argv: string[],
  paths: ViewPaths = DEFAULT_PATHS,
): Promise<number> {
  const _ = argv; // evaluate は現状フラグを取らない
  const rows = await loadRows(paths);
  if (rows.length === 0) {
    console.error("データセットが空です（先に deno task cal register してください）");
    return 1;
  }
  console.log("ラベル  正本  実験  差分  作品");
  for (const row of rows) {
    const q = (row.quality ?? "-").padEnd(3);
    const sign = row.diff > 0 ? `+${row.diff}` : String(row.diff);
    console.log(
      `${q} ${String(row.canonicalScore).padStart(4)} ${String(row.experimentScore).padStart(4)} ${
        sign.padStart(5)
      }  ${row.record.title.slice(0, 30)}`,
    );
  }
  return 0;
}
