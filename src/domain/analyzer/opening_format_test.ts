import { assertEquals } from "@std/assert";
import { classifyOpeningFormat } from "./opening_format.ts";

const FIXTURES_DIR = new URL("../../../tests/fixtures/", import.meta.url).pathname;

function loadFixture(name: string): string {
  return Deno.readTextFileSync(`${FIXTURES_DIR}${name}`);
}

function normalNarrative(sentenceCount: number): string {
  const sentences = [
    "今日はいい天気だ。",
    "朝の空気が気持ちいい。",
    "駅まで歩くと決めた。",
    "途中の公園で足を止めた。",
    "小さな花が咲いている。",
    "思わずしゃがんで眺めた。",
    "風がそっと頬を撫でた。",
  ];
  const parts: string[] = [];
  for (let i = 0; i < sentenceCount; i++) {
    parts.push(sentences[i % sentences.length]);
  }
  return parts.join("\n");
}

Deno.test("classify: 掲示板形式（本文シグナル）を判定", () => {
  const text = [
    "【あるゲーム】について語るスレ　Part100",
    "1：名無しの探索者",
    ">>1 それな",
    "2：名無しの探索者",
    "わかる",
    "3：名無しの探索者",
    "自分も見てきた",
  ].join("\n");
  assertEquals(classifyOpeningFormat(text, "第1話"), "bulletin-board");
});

Deno.test("classify: キャラ紹介形式（本文シグナル）を判定", () => {
  const text = [
    "主人公",
    "白凪　葵　（しらなぎ　あおい）",
    "16歳　高校1年生　誕生日7月7日",
    "身長は160の体重は非公開です。",
    "特徴は白髪であることと美少女であること",
    "追記:葵さんはオタクに優しいギャルを目指している。",
    "Q:あなたにとって葵さんはどんな人ですか？",
    "A:親友です",
    "親友",
    "佐藤　英理　（さとう　えり）",
    "16歳　高校1年生　誕生日6月1日",
    "身長158センチ　体重53キロ",
    "特徴は金髪ボブのギャルであること",
    "追記:英理さんは可愛いものが大好きです。",
    "Q:あなたにとって葵さんはどんな人ですか？",
    "A:大切な人かなー",
  ].join("\n");
  assertEquals(classifyOpeningFormat(text, "第1話"), "character-intro");
});

Deno.test("classify: 短文（30文未満）を判定", () => {
  assertEquals(classifyOpeningFormat(normalNarrative(10), "第1話"), "too-short");
});

Deno.test("classify: ちょうど30文は短文ではない", () => {
  assertEquals(classifyOpeningFormat(normalNarrative(30), "第1話"), "normal");
});

Deno.test("classify: 通常ナラティブを判定", () => {
  assertEquals(classifyOpeningFormat(normalNarrative(40), "第1話"), "normal");
});

Deno.test("classify: 本文シグナルが弱くタイトルのみでキャラ紹介と判定", () => {
  assertEquals(
    classifyOpeningFormat(normalNarrative(40), "キャラクター紹介"),
    "character-intro",
  );
});

Deno.test("classify: 本文シグナルが弱くタイトルのみで掲示板と判定", () => {
  assertEquals(
    classifyOpeningFormat(normalNarrative(40), "掲示板スレまとめ"),
    "bulletin-board",
  );
});

Deno.test("classify: 掲示板の構造シグナルは短文判定より優先される", () => {
  const text = ["1：名無しの探索者", "わかる", "2：名無しの探索者", "それな"].join("\n");
  assertEquals(classifyOpeningFormat(text, "第1話"), "bulletin-board");
});

Deno.test("classify: キャラ紹介の構造シグナルは短文判定より優先される", () => {
  const text = [
    "名前　テスト　（てすと）",
    "10歳　誕生日3月3日",
    "身長130センチ",
    "特徴は元気なこと",
    "Q:好きなものは？",
    "A:犬です",
    "親友",
    "名前　サンプル　（さんぷる）",
    "11歳　誕生日5月5日",
    "身長135センチ",
    "特徴は落ち着いていること",
    "Q:苦手なものは？",
    "A:雷です",
  ].join("\n");
  assertEquals(classifyOpeningFormat(text, "第1話"), "character-intro");
});

Deno.test("classify: 掲示板開幕 fixture を判定", () => {
  const text = loadFixture("opening-bulletin-board-ep1.txt");
  assertEquals(classifyOpeningFormat(text, "プロローグ　掲示板12"), "bulletin-board");
});

Deno.test("classify: キャラ紹介開幕 fixture を判定", () => {
  const text = loadFixture("opening-char-intro-ep1.txt");
  assertEquals(
    classifyOpeningFormat(text, "キャラ紹介　（ネタバレ含みます）"),
    "character-intro",
  );
});

Deno.test("classify: 掲示板開幕の次話（通常ナラティブ fixture）を判定", () => {
  const text = loadFixture("opening-bulletin-board-ep2.txt");
  assertEquals(classifyOpeningFormat(text, "第1話　或る社畜の目覚め"), "normal");
});

Deno.test("classify: キャラ紹介開幕の次話（通常ナラティブ fixture）を判定", () => {
  const text = loadFixture("opening-char-intro-ep2.txt");
  assertEquals(
    classifyOpeningFormat(text, "第1話　オタクに優しいギャル誕生？"),
    "normal",
  );
});
