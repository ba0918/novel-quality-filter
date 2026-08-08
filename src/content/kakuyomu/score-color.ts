import type { ScoreResult } from "../../domain/types.ts";

const COLOR_RED_BOUNDARY = 35;

export function scoreToColor(score: number): string {
  let hue: number;
  if (score <= COLOR_RED_BOUNDARY) {
    hue = 0;
  } else if (score <= 65) {
    hue = ((score - COLOR_RED_BOUNDARY) / 30) * 40;
  } else {
    hue = 40 + ((score - 65) / 35) * 80;
  }

  const saturation = score <= COLOR_RED_BOUNDARY ? 70 : 55;
  const lightness = score <= COLOR_RED_BOUNDARY ? 45 : 38;
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

export function createTooltip(result: ScoreResult): HTMLSpanElement {
  const tooltip = document.createElement("span");
  tooltip.className = "nqf-tooltip";

  const flagged = result.metrics.filter((m) => m.flagged);
  if (flagged.length === 0 && result.penalties.length === 0) {
    tooltip.textContent = "問題なし";
    return tooltip;
  }

  for (const m of flagged) {
    const line = document.createElement("span");
    line.className = "nqf-tooltip-line";
    line.textContent = `⚠ ${m.reason}`;
    tooltip.appendChild(line);
  }

  for (const p of result.penalties) {
    const line = document.createElement("span");
    line.className = "nqf-tooltip-line";
    line.textContent = `⚠ ${p.label} x${p.multiplier}`;
    tooltip.appendChild(line);
  }

  return tooltip;
}
