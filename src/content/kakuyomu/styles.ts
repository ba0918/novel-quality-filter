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
  min-width: 28px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #fff;
  cursor: pointer;
  user-select: none;
  position: relative;
  line-height: 1;
  margin-left: 8px;
  vertical-align: text-bottom;
  transition: opacity 0.2s ease;
}

.nqf-badge:hover {
  opacity: 0.85;
}

.nqf-badge--queued {
  background: #bbb;
  pointer-events: none;
}

.nqf-badge--loading {
  background: #999;
  pointer-events: none;
  animation: nqf-pulse 1.2s ease-in-out infinite;
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
  z-index: 999;
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

/* --- 作品ページ用 --- */

.nqf-work-wrapper {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  margin-left: auto;
}

.nqf-work-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 20px;
  padding: 0 7px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #fff;
  cursor: pointer;
  user-select: none;
  position: relative;
  line-height: 1;
  vertical-align: middle;
  margin-left: 8px;
  vertical-align: middle;
  transition: opacity 0.2s ease;
}

.nqf-work-badge:hover {
  opacity: 0.85;
}

.nqf-work-badge--open {
  opacity: 0.9;
}

.nqf-work-badge:hover .nqf-tooltip {
  display: block;
}

.nqf-work-badge--open:hover .nqf-tooltip {
  display: none;
}

.nqf-score-button {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border: 1px solid #999;
  border-radius: 12px;
  background: transparent;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #666;
  cursor: pointer;
  margin-left: 8px;
  vertical-align: middle;
  transition: background 0.2s ease, color 0.2s ease;
}

.nqf-score-button:hover {
  background: #f0f0f0;
  color: #333;
}

.nqf-score-button--loading {
  pointer-events: none;
  color: #999;
  animation: nqf-pulse 1.2s ease-in-out infinite;
}

.nqf-detail-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.5;
  width: 400px;
  z-index: 999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.nqf-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e0e0e0;
}

.nqf-detail-score-label {
  font-weight: 700;
  color: #333;
}

.nqf-detail-score-value {
  font-size: 20px;
  font-weight: 700;
}

.nqf-detail-section-title {
  font-weight: 700;
  color: #555;
  margin-bottom: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nqf-detail-section-title--penalty {
  color: #c44;
  margin-top: 10px;
}

.nqf-metric-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}

.nqf-metric-row--flagged {
  color: #c44;
}

.nqf-metric-label {
  flex: 0 0 140px;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nqf-metric-raw {
  flex: 0 0 50px;
  text-align: right;
  font-size: 11px;
  color: #888;
}

.nqf-metric-bar-container {
  flex: 1 1 60px;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
}

.nqf-metric-bar {
  display: block;
  height: 100%;
  background: #4a9;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.nqf-metric-bar--flagged {
  background: #c44;
}

.nqf-metric-norm {
  flex: 0 0 36px;
  text-align: right;
  font-size: 11px;
}

.nqf-penalty-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
  color: #c44;
}

.nqf-penalty-label {
  font-size: 11px;
}

.nqf-penalty-multiplier {
  font-size: 11px;
  font-weight: 700;
}

.nqf-rescore-button {
  display: block;
  width: 100%;
  margin-top: 10px;
  padding: 6px 0;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: background 0.2s ease;
}

.nqf-rescore-button:hover {
  background: #eee;
}

.nqf-rescore-button:disabled {
  pointer-events: none;
  color: #999;
}

@keyframes nqf-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;
