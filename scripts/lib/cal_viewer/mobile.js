// スマホ向けラベル付けページの UI 本体。cal.json を fetch して未ラベル作品を境界帯順に
// 1 件ずつカード表示し、良/駄/対象外/スキップの操作を既存 API (POST /labels,
// DELETE /labels/:siteWorkId) へ流す。app.js (デスクトップ SPA) とは独立の入口で、
// CDN 依存なしの vanilla DOM (寝ながらの回線でも確実に開けることを優先)。
// タイトル・作者など外部由来文字列は textContent で描画し、URL は safeHref で検証する。

import { safeHref } from "./format.js";
import { buildQueue, scoreOf } from "./mobile_queue.js";

const app = document.getElementById("app");

// キューと操作履歴。queue[0] が表示中カード。history は取り消し用に直近の操作を積む。
const state = {
  queue: [],
  total: 0,
  done: 0,
  history: [],
  busy: false,
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function chip(text, extraClass) {
  return el("span", extraClass ? `chip ${extraClass}` : "chip", text);
}

async function postLabel(siteWorkId, value) {
  const res = await fetch("/labels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteWorkId, value }),
  });
  if (!res.ok) throw new Error(`POST /labels ${res.status}`);
}

async function deleteLabel(siteWorkId) {
  const res = await fetch(`/labels/${encodeURIComponent(siteWorkId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /labels ${res.status}`);
}

// ラベル書き込み成功後にキューを進める。busy フラグで連打の二重送信を防ぐ。
async function applyLabel(value) {
  if (state.busy || state.queue.length === 0) return;
  state.busy = true;
  const work = state.queue[0];
  try {
    await postLabel(work.siteWorkId, value);
    state.queue.shift();
    state.done++;
    state.history.push({ work, value });
    render();
  } catch (e) {
    renderError(`保存に失敗しました: ${e.message}`);
  } finally {
    state.busy = false;
  }
}

function skip() {
  if (state.busy || state.queue.length === 0) return;
  // 後でもう一度出す (列の末尾へ後送り)
  state.queue.push(state.queue.shift());
  render();
}

async function undo() {
  if (state.busy || state.history.length === 0) return;
  state.busy = true;
  const last = state.history.pop();
  try {
    await deleteLabel(last.work.siteWorkId);
    state.queue.unshift(last.work);
    state.done--;
    render();
  } catch (e) {
    renderError(`取り消しに失敗しました: ${e.message}`);
  } finally {
    state.busy = false;
  }
}

function renderError(message) {
  render();
  app.prepend(el("p", "error", message));
}

function renderCard(work) {
  const card = el("div", "card");

  const title = el("h1");
  const titleLink = el("a", "", work.title ?? "(無題)");
  titleLink.href = safeHref(work.url ?? "#");
  titleLink.target = "_blank";
  title.append(titleLink);
  card.append(title);

  card.append(el("p", "author", work.author ?? ""));

  const chips = el("div", "chips");
  chips.append(chip(`スコア ${scoreOf(work)}`, "score"));
  const meta = work.meta ?? {};
  if (meta.totalCharacterCount) {
    chips.append(chip(`${Math.round(meta.totalCharacterCount / 1000)}千字`));
  }
  if (meta.reviewCount !== undefined) chips.append(chip(`レビュー ${meta.reviewCount}`));
  for (const tag of meta.seedTags ?? []) chips.append(chip(tag));
  card.append(chips);

  const read = el("a", "read-link", "第 1 話を読む →");
  read.href = safeHref(work.episodeUrl ?? work.url ?? "#");
  read.target = "_blank";
  card.append(read);

  return card;
}

function renderActions() {
  const actions = el("div", "actions");
  const buttons = [
    ["良", "good", () => applyLabel("良")],
    ["駄", "bad", () => applyLabel("駄")],
    ["対象外", "excl", () => applyLabel("対象外")],
    ["スキップ", "skip", skip],
  ];
  for (const [label, cls, onClick] of buttons) {
    const btn = el("button", cls, label);
    btn.addEventListener("click", onClick);
    actions.append(btn);
  }
  return actions;
}

function render() {
  app.replaceChildren();

  const progress = el("div", "progress");
  progress.append(el("span", "", `残り ${state.queue.length} 件`));
  progress.append(el("span", "", `ラベル済み ${state.done}`));
  app.append(progress);

  if (state.queue.length === 0) {
    app.append(
      el("p", "done", `未ラベルの作品はありません 🎉 (この端末で ${state.done} 件ラベル付け)`),
    );
  } else {
    app.append(renderCard(state.queue[0]));
  }

  const undoBar = el("div", "undo-bar");
  const last = state.history[state.history.length - 1];
  undoBar.append(
    el("span", "", last ? `直前: ${last.value} — ${last.work.title ?? ""}`.slice(0, 40) : ""),
  );
  if (last) {
    const undoBtn = el("button", "", "取り消す");
    undoBtn.addEventListener("click", undo);
    undoBar.append(undoBtn);
  }
  app.append(undoBar);

  if (state.queue.length > 0) app.append(renderActions());
}

async function main() {
  let data;
  try {
    const res = await fetch("./cal.json");
    if (!res.ok) throw new Error(`${res.status}`);
    data = await res.json();
  } catch (e) {
    app.replaceChildren(
      el(
        "p",
        "error",
        `cal.json を読み込めませんでした (${e.message})。先に deno task cal list を実行してください。`,
      ),
    );
    return;
  }
  state.queue = buildQueue(data.works ?? []);
  state.total = state.queue.length;
  render();
}

main();
