// 較正ビューア Detail の chip をクリック可能ボタンに変え、popover でラベル編集を受け付ける。
// 純関数部分（fetch URL/body 組み立て）は label_editor_test.ts で Deno test 対象、DOM 副作用
// (popover の open/close, focus 制御, optimistic UI + rollback, toast) は Playwright 対象。
//
// popover の閉じ方は 3 経路（外側クリック / ESC / 値選択）で統一し、focus は開いたときに
// 先頭 menuitemradio へ移し、閉じたら開いた元のボタンへ戻す（キーボードアクセス性）。
// 同時に複数の popover が開かないよう、単一 slot（activePopover）を module 内に持つ。

import { showToast } from "./toast.js";

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

// fetch を投げ、失敗なら onRollback + toast、成功なら nop。onSuccess は optimistic に
// 先行して UI を更新した後の追認（ここでは呼ばない設計 = 常に先に更新済み前提）。
async function sendLabelRequest(req, { rollback, errorMessage }) {
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    rollback();
    showToast(`${errorMessage}（${e.message ?? e}）`, { kind: "error" });
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

// mount(anchor, {siteWorkId, getCurrentValue, onUpdate}) — anchor（Detail の chip button）
// にクリック時 popover を出す挙動を結線する。getCurrentValue は毎クリック時に呼ばれ
// 「良/駄/対象外/null」を返す（null=未ラベル）。onUpdate(nextValue) は optimistic UI の
// 受け口で、Detail とサイドバー行の chip を再描画するコールバック。
// 返り値は dispose 関数で、Preact useEffect の cleanup に渡すことでイベント解除できる。
export function mount(anchor, { siteWorkId, getCurrentValue, onUpdate }) {
  const handler = (e) => {
    e.stopPropagation();
    if (activePopover && activePopover.anchor === anchor) {
      closeActive();
      return;
    }
    closeActive();
    openPopover(anchor, { siteWorkId, currentValue: getCurrentValue(), onUpdate });
  };
  anchor.addEventListener("click", handler);
  return () => {
    anchor.removeEventListener("click", handler);
    if (activePopover && activePopover.anchor === anchor) closeActive();
  };
}

function openPopover(anchor, { siteWorkId, currentValue, onUpdate }) {
  const previousFocus = document.activeElement;
  const popover = document.createElement("div");
  popover.className = "label-popover";
  popover.setAttribute("role", "menu");

  const selectValue = (nextValue) => {
    const previous = currentValue;
    // optimistic: 先に UI を新値へ切り替える。失敗時は rollback で戻す。
    onUpdate(nextValue);
    closeActive();
    const req = nextValue === null
      ? deleteLabelRequest(siteWorkId)
      : setLabelRequest(siteWorkId, nextValue);
    sendLabelRequest(req, {
      rollback: () => onUpdate(previous),
      errorMessage: "ラベル更新に失敗しました",
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
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    },
  };

  const firstItem = popover.querySelector(".label-popover-item");
  if (firstItem) firstItem.focus();
}
