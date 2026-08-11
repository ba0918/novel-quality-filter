// 軽量トースト。POST /labels の失敗（rollback 契機）などで一時的な通知を出すために使う。
// スタック可能・auto-dismiss（既定 3.5 秒）。CDN 追加や重い依存を避けるため裸の DOM で組む。

const CONTAINER_ID = "cal-toast-container";
const DEFAULT_DURATION_MS = 3500;

function ensureContainer() {
  let container = document.getElementById(CONTAINER_ID);
  if (container) return container;
  container = document.createElement("div");
  container.id = CONTAINER_ID;
  // レイアウト非侵襲になるよう固定配置。style.css の .toast-container / .toast に見た目を委ねる。
  container.className = "toast-container";
  document.body.appendChild(container);
  return container;
}

// showToast(message, {kind}) — kind: "error" | "warning" | "info"（見た目のバリアント。
// default は "info"）。error だけが role="alert"（緊急読み上げ）で、warning/info は
// role="status"（穏やかな読み上げ）。warning は「操作は成功したが利用者へ知らせる」用途
// （例: cal.json patch 失敗のとき labels.jsonl は正のまま warning だけ出す）。
// 返り値はトースト要素そのものではなく dismiss 関数（呼ぶと即座に消える）。
export function showToast(message, options = {}) {
  const { kind = "info", durationMs = DEFAULT_DURATION_MS } = options;
  const container = ensureContainer();
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.textContent = message;
  container.appendChild(el);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.remove();
  };
  const timer = setTimeout(dismiss, durationMs);
  el.addEventListener("click", () => {
    clearTimeout(timer);
    dismiss();
  });
  return dismiss;
}
