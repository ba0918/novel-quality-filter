const STYLE_ID = "nqf-styles";

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
.nqf-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #fff;
  cursor: pointer;
  user-select: none;
  position: relative;
  z-index: 10;
  line-height: 1;
  margin-left: 8px;
  vertical-align: middle;
  transition: opacity 0.2s ease;
}

.nqf-badge:hover {
  opacity: 0.85;
}

.nqf-badge--loading {
  background: #999;
  pointer-events: none;
}

.nqf-tooltip {
  display: none;
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 6px;
  padding: 8px 12px;
  background: rgba(30, 30, 30, 0.95);
  color: #eee;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.5;
  border-radius: 6px;
  white-space: nowrap;
  z-index: 1000;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.nqf-badge:hover .nqf-tooltip {
  display: block;
}

.nqf-tooltip-line {
  display: block;
}

.nqf-suspect {
  opacity: 0.35;
  transition: opacity 0.4s ease;
}

.nqf-suspect:hover {
  opacity: 0.7;
}
`;
