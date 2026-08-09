import { MIN_SAMPLED_SENTENCES } from "../../shared/constants.ts";
import type { OpeningFormat } from "../types.ts";
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
