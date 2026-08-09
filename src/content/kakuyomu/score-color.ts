import type { ScoreResult } from "../../domain/types.ts";

const COLOR_RED_BOUNDARY = 35;
const COLOR_GREEN_BOUNDARY = 65;
const SCORE_MAX = 100;
const RED_HUE = 0;
const GREEN_HUE = 40;
const BLUE_HUE = 120;
const LOW_SCORE_SATURATION = 70;
const NORMAL_SATURATION = 55;
const LOW_SCORE_LIGHTNESS = 45;
const NORMAL_LIGHTNESS = 38;

export function scoreToColor(score: number): string {
  let hue: number;
  if (score <= COLOR_RED_BOUNDARY) {
    hue = RED_HUE;
  } else if (score <= COLOR_GREEN_BOUNDARY) {
    const range = COLOR_GREEN_BOUNDARY - COLOR_RED_BOUNDARY;
    hue = ((score - COLOR_RED_BOUNDARY) / range) * (GREEN_HUE - RED_HUE);
  } else {
    const range = SCORE_MAX - COLOR_GREEN_BOUNDARY;
    hue = GREEN_HUE + ((score - COLOR_GREEN_BOUNDARY) / range) * (BLUE_HUE - GREEN_HUE);
  }

  const saturation = score <= COLOR_RED_BOUNDARY ? LOW_SCORE_SATURATION : NORMAL_SATURATION;
  const lightness = score <= COLOR_RED_BOUNDARY ? LOW_SCORE_LIGHTNESS : NORMAL_LIGHTNESS;
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
