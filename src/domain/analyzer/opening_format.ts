import { MIN_SAMPLED_SENTENCES } from "../../shared/constants.ts";
import type { LineData, OpeningFormat } from "../types.ts";
import { splitSentences } from "./sentences.ts";

const BULLETIN_BOARD_TITLE_KEYWORDS = ["掲示板", "スレ", "Part"];
const CHARACTER_INTRO_TITLE_KEYWORDS = [
  "キャラ",
  "登場人物",
  "人物紹介",
  "プロフィール",
  "設定",
];

const REPLY_LINE_RATIO_THRESHOLD = 0.2;
const MIN_REPLY_LINES = 5;
const MIN_ANCHORS = 3;
const CHARACTER_INTRO_BODY_SCORE = 15;

export const OPENING_FORMAT_LABELS: Record<OpeningFormat, string> = {
  normal: "通常開幕",
  "character-intro": "キャラ紹介開幕",
  "bulletin-board": "掲示板開幕",
  "too-short": "短文開幕",
};

export function formatOpeningContext(
  openingType: OpeningFormat | undefined,
  sampledCount: number | undefined,
  targetEpisodeIndex = 0,
): string {
  const label = openingType === undefined
    ? OPENING_FORMAT_LABELS.normal
    : OPENING_FORMAT_LABELS[openingType];
  // 再評価表記は採点対象が第1話以外のときのみ表示する
  // （全編掲示板フォールバックは第1話採点のため再評価表記なし）
  if (sampledCount !== undefined && targetEpisodeIndex > 0) {
    return `${label} / ${sampledCount}話で再評価`;
  }
  return label;
}

export function classifyOpeningFormat(text: string, episodeTitle: string): OpeningFormat {
  if (hasBulletinBoardBodySignal(text)) return "bulletin-board";
  if (hasCharacterIntroBodySignal(text)) return "character-intro";
  if (titleMatchesAny(episodeTitle, BULLETIN_BOARD_TITLE_KEYWORDS)) return "bulletin-board";
  if (titleMatchesAny(episodeTitle, CHARACTER_INTRO_TITLE_KEYWORDS)) return "character-intro";
  if (splitSentences(text).length < MIN_SAMPLED_SENTENCES) return "too-short";
  return "normal";
}

function hasBulletinBoardBodySignal(text: string): boolean {
  const lines = text.split(/\n/);
  const nonEmptyCount = lines.filter((l) => l.length > 0).length;
  if (nonEmptyCount === 0) return false;

  const replyLineCount = lines.filter((l) => /^\s*\d+[:：]/.test(l)).length;
  const anchorCount = (text.match(/>>\d+/g) ?? []).length;
  const hasNameless = text.includes("名無し");

  if (replyLineCount / nonEmptyCount >= REPLY_LINE_RATIO_THRESHOLD) return true;
  if (replyLineCount >= MIN_REPLY_LINES && hasNameless) return true;
  return anchorCount >= MIN_ANCHORS;
}

function hasCharacterIntroBodySignal(text: string): boolean {
  const lines = text.split(/\n/);
  let score = 0;
  for (const line of lines) {
    if (/^(Q|A|追記|備考)\s*[:：]/.test(line)) score += 1;
    if (/^[^\s（(]+[\s　]+[^\s（(]+\s*[（(]/.test(line)) score += 3;
  }
  score += (text.match(/誕生日/g) ?? []).length * 3;
  score += (text.match(/身長/g) ?? []).length * 3;
  score += (text.match(/\d+\s*〜\s*\d+\s*歳|\d+歳/g) ?? []).length * 2;
  return score >= CHARACTER_INTRO_BODY_SCORE;
}

function titleMatchesAny(title: string, keywords: string[]): boolean {
  return keywords.some((k) => title.includes(k));
}

export interface SampledEpisode {
  text: string;
  lines: LineData[];
  format: OpeningFormat;
}

export interface SamplingDecision {
  done: boolean;
  targetText: string;
  targetLines: LineData[];
  openingType: OpeningFormat;
  sampledCount: number;
  targetEpisodeIndex: number;
}

export function selectSamplingTarget(episodes: SampledEpisode[]): SamplingDecision {
  const first = episodes[0];
  // openingType は常に開幕話（第1話）の形式を保持する。
  // 再採点で採点対象が後続話になっても、開幕文脈は変わらない。
  const openingType = first.format;

  if (first.format === "normal") {
    return {
      done: true,
      targetText: first.text,
      targetLines: first.lines,
      openingType,
      sampledCount: episodes.length,
      targetEpisodeIndex: 0,
    };
  }

  // buffer（採点対象本文）と bufferLines（採点対象の行）は常に同じ話集合・
  // 同じ順序で構成する。両者が食い違うと診断メタデータが本文とずれる。
  let buffer: string | null = null;
  let bufferLines: LineData[] = [];
  let bufferStartIndex = 0;

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];

    if (ep.format === "normal") {
      if (splitSentences(ep.text).length >= MIN_SAMPLED_SENTENCES) {
        return {
          done: true,
          targetText: ep.text,
          targetLines: ep.lines,
          openingType,
          sampledCount: episodes.length,
          targetEpisodeIndex: i,
        };
      }
      if (buffer === null) {
        buffer = "";
        bufferLines = [];
        bufferStartIndex = i;
      }
      buffer += ep.text;
      bufferLines.push(...ep.lines);
    } else if (ep.format === "too-short") {
      // 短文 = 通常ナラティブの冒頭。累積連結の対象に含める
      if (buffer === null) {
        buffer = "";
        bufferLines = [];
        bufferStartIndex = i;
      }
      buffer += ep.text;
      bufferLines.push(...ep.lines);
    } else {
      // 非ナラティブ形式は累積連結を断ち切る
      buffer = null;
      bufferLines = [];
    }

    if (buffer !== null && splitSentences(buffer).length >= MIN_SAMPLED_SENTENCES) {
      return {
        done: true,
        targetText: buffer,
        targetLines: bufferLines,
        openingType,
        sampledCount: episodes.length,
        targetEpisodeIndex: bufferStartIndex,
      };
    }
  }

  // 通常形式（30文以上）に達しなかった → 第1話で採点+形式ラベル
  return {
    done: false,
    targetText: first.text,
    targetLines: first.lines,
    openingType,
    sampledCount: episodes.length,
    targetEpisodeIndex: 0,
  };
}
