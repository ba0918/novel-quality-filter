// 較正ビューア Detail の chip をクリック可能ボタンに変え、popover でラベル編集を受け付ける。
// 純関数部分（fetch URL/body 組み立て）は label_editor_test.ts で Deno test 対象、DOM 副作用
// (popover の open/close, focus 制御, optimistic UI + rollback, toast) は Playwright 対象。
//
// popover の閉じ方は 3 経路（外側クリック / ESC / 値選択）で統一し、focus は開いたときに
// 先頭 menuitemradio へ移し、閉じたら開いた元のボタンへ戻す（キーボードアクセス性）。
// 同時に複数の popover が開かないよう、単一 slot（activePopover）を module 内に持つ。

import { showToast } from "./toast.js";
import { primaryLabelValue } from "./label_update.js";

const LABEL_OPTIONS = [
  { value: "良", label: "良" },
  { value: "駄", label: "駄" },
  { value: "対象外", label: "対象外" },
];
const UNLABEL_LABEL = "未ラベルに戻す";

// --- 純関数（テスト対象） ---

// POST /labels の Fetch 引数を組み立てる。サーバー側 handleLabelPost の契約と 1:1 対応。
export function setLabelRequest(siteWorkId, value) {
  return {
    url: "/labels",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteWorkId, value }),
  };
}

// DELETE /labels/:siteWorkId の Fetch 引数。siteWorkId は encodeURIComponent し、
// サーバー側で decodeURIComponent → enum パターン検証されることを前提にする。
export function deleteLabelRequest(siteWorkId) {
  return {
    url: `/labels/${encodeURIComponent(siteWorkId)}`,
    method: "DELETE",
    body: undefined,
  };
}

// --- DOM 副作用（Playwright 対象） ---

let activePopover = null;

function closeActive() {
  if (!activePopover) return;
  const { element, onCleanup } = activePopover;
  activePopover = null;
  element.remove();
  onCleanup();
}

function onDocumentClick(event) {
  if (!activePopover) return;
  if (activePopover.element.contains(event.target)) return;
  if (activePopover.anchor.contains(event.target)) return;
  closeActive();
}

function onDocumentKeydown(event) {
  if (!activePopover) return;
  if (event.key === "Escape") {
    event.stopPropagation();
    closeActive();
  }
}

// ラベル更新の optimistic → fetch → 失敗時 rollback の流れを 1 関数にまとめ、
// fetch / UI コールバックを注入可能にした純テスト対象。DOM を触らないため Deno test で
// 直接検証できる（DOM 依存の popover open/close は Playwright 側）。
//
// rollback は「操作前の labels 配列全体」を previousLabels スナップショットで受け取り、
// onRollback(previousLabels) で labels 配列を丸ごと戻す。primary 値だけを持ち回ると、
// optimistic 更新済みの labels を元に再計算してしまい、[良,対象外] → 「駄」失敗 →
// [駄] を元に「対象外」を差し込むと [駄,対象外] になり、silent に quality が
// 「良」→「駄」へ書き換わる race を招くため（labels 配列全体を復元する契約）。
//
// onWarning は「200 + JSON body {warning}」経路の受け口（cal_serve が
// labels.jsonl は更新済 + cal.json patch 失敗を返すケース）。この経路では
// labels.jsonl が正なので rollback すると UI 表示と永続層がむしろズレる。
// rollback は呼ばず warning toast だけを出す。省略時は noop（既存呼び出しの後方互換）。
export async function performLabelUpdate({
  siteWorkId,
  nextValue,
  previousLabels,
  fetchImpl,
  onOptimisticUpdate,
  onRollback,
  onError,
  onWarning = (_msg) => {},
}) {
  onOptimisticUpdate(nextValue);
  const req = nextValue === null
    ? deleteLabelRequest(siteWorkId)
    : setLabelRequest(siteWorkId, nextValue);
  try {
    const res = await fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // 成功時: content-type が JSON なら body から warning を拾って onWarning へ流す
    // （content-type 無し／JSON でないときは body を触らない — 現行の Response(null,200) を
    // 壊さないため）。warning が無ければ何もしない。
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await res.json().catch(() => null);
      if (body && typeof body.warning === "string") {
        onWarning(body.warning);
      }
    }
  } catch (e) {
    onRollback(previousLabels);
    onError(`ラベル更新に失敗しました（${e.message ?? e}）`);
  }
}

function buildMenuItem(text, { onSelect }) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "label-popover-item";
  item.setAttribute("role", "menuitemradio");
  item.textContent = text;
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelect();
  });
  return item;
}

// mount(anchor, {siteWorkId, getCurrentLabels, onUpdate, onRestore}) — anchor（Detail
// の chip button）にクリック時 popover を出す挙動を結線する。getCurrentLabels は
// 毎クリック時に呼ばれ「現在の labels 配列全体」を返す（optimistic 更新後の値ではなく、
// popover を開いた瞬間の値をスナップショットに使う）。onUpdate(nextValue) は optimistic
// UI の受け口。onRestore(previousLabels) は fetch 失敗時に labels 配列を丸ごと復元する
// 受け口で、primary 値経由の差分再計算では復元しきれない状態（quality と scope の
// 両立、cal tag で付けた任意タグ）を含めて 1 発で戻すために別コールバックにしている。
// 返り値は dispose 関数で、Preact useEffect の cleanup に渡すことでイベント解除できる。
export function mount(anchor, { siteWorkId, getCurrentLabels, onUpdate, onRestore }) {
  const handler = (e) => {
    e.stopPropagation();
    if (activePopover && activePopover.anchor === anchor) {
      closeActive();
      return;
    }
    closeActive();
    openPopover(anchor, {
      siteWorkId,
      currentLabels: getCurrentLabels(),
      onUpdate,
      onRestore,
    });
  };
  anchor.addEventListener("click", handler);
  return () => {
    anchor.removeEventListener("click", handler);
    if (activePopover && activePopover.anchor === anchor) closeActive();
  };
}

function openPopover(anchor, { siteWorkId, currentLabels, onUpdate, onRestore }) {
  const previousFocus = document.activeElement;
  // 開いた瞬間の labels スナップショット。fetch 失敗時はこれで labels 配列全体を戻す
  // （popover を開いた後に別経路で labels が更新される可能性は現在の設計では無いが、
  // スナップショットを固定しておく方が rollback の意味論として単純）。
  const snapshotLabels = [...currentLabels];
  const currentValue = primaryLabelValue(currentLabels);
  // popover 開閉に合わせて anchor の aria-expanded を反転する。スクリーンリーダーで
  // 「chip をクリックしたら menu が開いた/閉じた」の状態変化が読まれる。
  anchor.setAttribute("aria-expanded", "true");
  const popover = document.createElement("div");
  popover.className = "label-popover";
  popover.setAttribute("role", "menu");

  const selectValue = (nextValue) => {
    closeActive();
    performLabelUpdate({
      siteWorkId,
      nextValue,
      previousLabels: snapshotLabels,
      fetchImpl: (url, init) => fetch(url, init),
      onOptimisticUpdate: onUpdate,
      onRollback: onRestore,
      onError: (message) => showToast(message, { kind: "error" }),
      onWarning: (message) => showToast(message, { kind: "warning" }),
    });
  };

  for (const opt of LABEL_OPTIONS) {
    const item = buildMenuItem(opt.label, { onSelect: () => selectValue(opt.value) });
    if (opt.value === currentValue) item.setAttribute("aria-checked", "true");
    popover.appendChild(item);
  }

  const sep = document.createElement("div");
  sep.className = "label-popover-sep";
  popover.appendChild(sep);

  const unlabel = buildMenuItem(UNLABEL_LABEL, { onSelect: () => selectValue(null) });
  if (currentValue === null) unlabel.setAttribute("aria-checked", "true");
  popover.appendChild(unlabel);

  // anchor 直下の位置に浮かせる。CSS 側 (.label-slot) が anchor を position: relative に
  // していれば absolute 配置で追随する。
  const slot = anchor.closest(".label-slot") ?? anchor.parentElement ?? document.body;
  slot.appendChild(popover);

  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKeydown, true);

  activePopover = {
    anchor,
    element: popover,
    onCleanup: () => {
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("keydown", onDocumentKeydown, true);
      anchor.setAttribute("aria-expanded", "false");
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    },
  };

  const firstItem = popover.querySelector(".label-popover-item");
  if (firstItem) firstItem.focus();
}
