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

  // 累積連結は常に連続した話の範囲 episodes[bufferStartIndex..i] を対象にする。
  // 開始位置だけ保持し、採点対象本文（targetText）と行（targetLines）は返却時に
  // 同じ範囲から導出する。両者を別々に持たないことで本文と診断メタデータのずれを防ぐ。
  let bufferStartIndex: number | null = null;

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];

    if (ep.format === "normal" && splitSentences(ep.text).length >= MIN_SAMPLED_SENTENCES) {
      return {
        done: true,
        targetText: ep.text,
        targetLines: ep.lines,
        openingType,
        sampledCount: episodes.length,
        targetEpisodeIndex: i,
      };
    }

    if (ep.format === "normal" || ep.format === "too-short") {
      // 通常形式（30文未満）と短文（通常ナラティブの冒頭）を累積連結の対象に含める
      if (bufferStartIndex === null) bufferStartIndex = i;
    } else {
      // 非ナラティブ形式は累積連結を断ち切る
      bufferStartIndex = null;
    }

    if (bufferStartIndex !== null) {
      const slice = episodes.slice(bufferStartIndex, i + 1);
      const bufferText = slice.map((e) => e.text).join("");
      if (splitSentences(bufferText).length >= MIN_SAMPLED_SENTENCES) {
        return {
          done: true,
          targetText: bufferText,
          targetLines: slice.flatMap((e) => e.lines),
          openingType,
          sampledCount: episodes.length,
          targetEpisodeIndex: bufferStartIndex,
        };
      }
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
