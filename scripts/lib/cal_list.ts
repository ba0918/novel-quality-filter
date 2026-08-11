// cal list / evaluate サブコマンド。dataset と labels を join し、各作品を正本式と実験式の
// 両方で再計算して「良/悪ラベル・正本スコア・実験スコア・差分」を並べる。較正ループの中心画面。
// スコアは常に rawMetrics からの再計算値で、収集時に保存した record.score は使わない。
//
// cal list の出力は単一の cal.json（全作品ぶんの識別情報・meta・rawMetrics・正規化後スコア・
// ScoreResult 内訳（正本式/実験式）・LineMetadata・ラベルを横並びで持つ）。描画はブラウザ側
// （cal_viewer/app.js、Preact + htm）が cal.json を fetch して行うため、ここに HTML 生成ロジックは
// 持たない（旧 render_dossier.ts / cal_detail.ts は廃止）。

import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { loadDataset } from "./dataset.ts";
import type { DatasetRecord } from "./dataset.ts";
import { loadLabels2 } from "./labels_store.ts";
import type { LabelRecord2, Quality } from "./labels_store.ts";
import { joinLabels } from "./analyze_separation.ts";
import { CANONICAL_FORMULA, evaluateRecord, EXPERIMENT_FORMULA } from "./cal_evaluate.ts";
import { DEFAULT_LABELS, DEFAULT_OUT } from "./labels_cli.ts";
import { loadViewerConfig } from "./cal_viewer_config.ts";
import type {
  LineMetadata,
  MetricResult,
  PenaltyResult,
  RawMetrics,
  ScoreResult,
} from "../../src/domain/types.ts";

export interface ViewPaths {
  datasetPath: string;
  labelsPath: string;
}

const DEFAULT_PATHS: ViewPaths = { datasetPath: DEFAULT_OUT, labelsPath: DEFAULT_LABELS };

export const CANONICAL_WEIGHTS_REF = "src/domain/scoring/weights.ts";
export const EXPERIMENT_WEIGHTS_REF = "src/domain/scoring/weights_experiment.ts";

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

async function loadRows(paths: ViewPaths): Promise<ComparisonRow[]> {
  const records = await loadDataset(paths.datasetPath);
  const labels = await loadLabels2(paths.labelsPath);
  return buildComparisonRows(records, labels);
}

// LabelRecord2 が持つ品質・スコープ・タグを、ブラウザ側でソート／フィルタしやすい
// フラットな文字列配列へ畳む（一覧の「ラベルでフィルタ」が参照する値）。
export function labelsFor(label: LabelRecord2 | undefined): string[] {
  if (!label) return [];
  const out: string[] = [];
  if (label.quality) out.push(label.quality);
  if (label.scope === "対象外") out.push("対象外");
  out.push(...label.tags);
  return out;
}

function siteAndKeyOf(record: DatasetRecord): { site: string; siteWorkId: string } {
  const siteWorkId = record.siteWorkId ?? `kakuyomu:${record.workId}`;
  return { site: siteWorkId.split(":")[0], siteWorkId };
}

interface CalFormulaResult {
  score: number;
  metrics: MetricResult[];
  penalties: PenaltyResult[];
}

function toFormulaResult(result: ScoreResult): CalFormulaResult {
  return { score: result.score, metrics: result.metrics, penalties: result.penalties };
}

export interface CalWorkMeta {
  reviewCount: number;
  totalReviewPoint: number;
  totalCharacterCount: number;
  openingType: string;
  sampledCount: number;
  seedTags: string[];
  crawledAt: string;
}

export interface CalWork {
  siteWorkId: string;
  workId: string;
  site: string;
  url: string;
  episodeUrl: string;
  title: string;
  author: string;
  meta: CalWorkMeta;
  labels: string[];
  rawMetrics: RawMetrics;
  lineMetadata?: LineMetadata;
  canonical: CalFormulaResult;
  experiment: CalFormulaResult;
  diff: number;
}

export interface CalJson {
  generatedAt: string;
  canonicalWeightsRef: string;
  experimentWeightsRef: string;
  works: CalWork[];
}

function buildCalWork(record: DatasetRecord, label: LabelRecord2 | undefined): CalWork {
  const { site, siteWorkId } = siteAndKeyOf(record);
  const canonical = evaluateRecord(record, CANONICAL_FORMULA);
  const experiment = evaluateRecord(record, EXPERIMENT_FORMULA);
  return {
    siteWorkId,
    workId: record.workId,
    site,
    url: record.url,
    episodeUrl: record.episodeUrl,
    title: record.title,
    author: record.author,
    meta: {
      reviewCount: record.reviewCount,
      totalReviewPoint: record.totalReviewPoint,
      totalCharacterCount: record.totalCharacterCount,
      openingType: record.openingType,
      sampledCount: record.sampledCount,
      seedTags: record.tags,
      crawledAt: record.crawledAt,
    },
    labels: labelsFor(label),
    rawMetrics: record.rawMetrics,
    lineMetadata: record.lineMetadata,
    canonical: toFormulaResult(canonical),
    experiment: toFormulaResult(experiment),
    diff: experiment.score - canonical.score,
  };
}

// cal.json の全体構造を組み立てる。works の順序は dataset の集計順（joinLabels の重複排除順）を
// 維持する。generatedAt は再現性のためテストから注入できるようにする。
export function buildCalJson(
  records: DatasetRecord[],
  labels: LabelRecord2[],
  generatedAt: string = new Date().toISOString(),
): CalJson {
  const works = joinLabels(records, labels).map(({ record, label }) => buildCalWork(record, label));
  return {
    generatedAt,
    canonicalWeightsRef: CANONICAL_WEIGHTS_REF,
    experimentWeightsRef: EXPERIMENT_WEIGHTS_REF,
    works,
  };
}

// cal list は cal.json を1本だけ焼く。一覧・詳細の描画はブラウザ側（cal_viewer/app.js）が
// fetch("./cal.json") して行うため、ここでは HTML を組み立てない。
export async function runList(
  argv: string[],
  paths: ViewPaths = DEFAULT_PATHS,
  distDir?: string,
): Promise<number> {
  if (argv.length > 0) {
    console.error("使い方: deno task cal list");
    return 1;
  }
  const records = await loadDataset(paths.datasetPath);
  const labels = await loadLabels2(paths.labelsPath);
  const calJson = buildCalJson(records, labels);
  if (calJson.works.length === 0) {
    console.error("データセットが空です（先に deno task cal register してください）");
    return 1;
  }

  const dir = distDir ?? (await loadViewerConfig()).distDir;
  await ensureDir(dir);
  const outPath = join(dir, "cal.json");
  await Deno.writeTextFile(outPath, JSON.stringify(calJson, null, 2));
  console.log(`cal.json を書き出しました: ${outPath}（${calJson.works.length}作品）`);
  return 0;
}

export async function runEvaluate(
  argv: string[],
  paths: ViewPaths = DEFAULT_PATHS,
): Promise<number> {
  if (argv.length > 0) {
    console.error("使い方: deno task cal evaluate");
    return 1;
  }
  const allRows = await loadRows(paths);
  if (allRows.length === 0) {
    console.error("データセットが空です（先に deno task cal register してください）");
    return 1;
  }
  // 集計処理は scope="対象外" のレコードを除外する（docs/spec/calibration-dataset.md
  // 「ラベル運用 / 2つの軸を分ける」参照）。対象外の作品は良/駄 の分離度計算を汚すので
  // 分析からは外す。一覧表示 (runList / buildCalJson) はここでは扱わず、そちらは
  // 対象外も含めて出す（サイドバーで見えないと再判定できないため）。
  const rows = allRows.filter((r) => r.scope !== "対象外");
  console.log("ラベル  正本  実験  差分  <14  <20  <30  作品");
  for (const row of rows) {
    const q = (row.quality ?? "-").padEnd(3);
    const sign = row.diff > 0 ? `+${row.diff}` : String(row.diff);
    // 地の文短行 14/20/30 の 3 列（率をパーセント整数）。lineMetadata が undefined な旧レコードは
    // 3 列とも "-" を出す（現状 backfill 済みで出現しないが defensive）。docs/spec/line-metadata.md
    // 「表示」節参照 — スコア・警告閾値には参加させず、目視で数字を並べるためだけの列。
    const narrative = row.record.lineMetadata?.narrative;
    const s14 = narrative ? shortColLabel(narrative.short14, narrative.lineCount) : "-";
    const s20 = narrative ? shortColLabel(narrative.short20, narrative.lineCount) : "-";
    const s30 = narrative ? shortColLabel(narrative.short30, narrative.lineCount) : "-";
    console.log(
      `${q} ${String(row.canonicalScore).padStart(4)} ${String(row.experimentScore).padStart(4)} ${
        sign.padStart(5)
      }  ${s14.padStart(4)} ${s20.padStart(4)} ${s30.padStart(4)}  ${
        row.record.title.slice(0, 30)
      }`,
    );
  }
  return 0;
}

// 短行率の 1 セル表示。分母 0 は "-"、それ以外は "NN%"（整数、"0%" も含む）。
function shortColLabel(numerator: number, denominator: number): string {
  if (denominator === 0) return "-";
  return `${Math.round((numerator / denominator) * 100)}%`;
}
