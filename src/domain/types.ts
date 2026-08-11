export interface TokenData {
  surface: string;
  details: string[];
}

export interface RawMetrics {
  charCount: number;
  sentenceCount: number;
  sentenceLengthSD: number;
  singleSentParaRatio: number;
  paragraphLengthSD: number;
  separatorCount: number;
  separatorFrequency: number;
  ttr: number;
  dialogueCount: number;
  dialogueEndingVariety: number;
  descriptionDensitySD: number;
  taigendomeEntropy: number;
  emotionDirectnessRatio: number;
  logicalConnectiveDensity: number;
  paragraphTransitionEntropy: number;
  sentenceLengthBurstiness: number;
}

export interface MetricResult {
  key: string;
  label: string;
  rawValue: number;
  normalizedValue: number;
  weight: number;
  contribution: number;
  flagged: boolean;
  reason: string;
}

export interface PenaltyResult {
  label: string;
  multiplier: number;
}

export interface ScoreResult {
  score: number;
  metrics: MetricResult[];
  penalties: PenaltyResult[];
  openingType?: OpeningFormat;
  sampledCount?: number;
  targetEpisodeIndex?: number;
  lineMetadata?: LineMetadata;
}

export type OpeningFormat = "normal" | "character-intro" | "bulletin-board" | "too-short";

export interface LineData {
  text: string;
  isBlank: boolean;
}

export type LineCategory =
  | "blank"
  | "separator"
  | "meta"
  | "dialogue"
  | "narrative"
  | "non-terminal";

export interface CategoryCount {
  lineCount: number;
  charCount: number;
  // short14 は較正実験用の追加集計（2026-08-11 追加）。
  // 既存レコード（backfill 前）には欠損する可能性があるため、消費側は 0 で扱う。
  short14: number;
  short20: number;
  short30: number;
}

export interface NarrativeCount extends CategoryCount {
  chunkCount: number;
  // shortChunk14 は較正実験用の追加集計（2026-08-11 追加）。
  shortChunk14: number;
  shortChunk20: number;
  shortChunk30: number;
}

export interface LineMetadata {
  totalLines: number;
  totalChars: number;
  blankCount: number;
  separatorCount: number;
  narrative: NarrativeCount;
  dialogue: CategoryCount;
  meta: CategoryCount;
  nonTerminal: CategoryCount;
}
