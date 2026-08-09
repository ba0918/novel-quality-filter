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
}

export type OpeningFormat = "normal" | "character-intro" | "bulletin-board" | "too-short";
