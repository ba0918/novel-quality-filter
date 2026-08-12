// スマホ向けラベル付けページのキュー構築 (純関数)。UI (mobile.js) から切り離してテスタブルに
// する (list_filter.js / format.js と同じ「計算は cal_viewer/*.js に集約」パターン)。

import { labelsOf } from "./list_filter.js";

// canonical スコア。欠損は 0 として扱い、境界帯ソートで最後尾に回す。
export function scoreOf(work) {
  return work.canonical?.score ?? 0;
}

const BOUNDARY_CENTER = 45; // 判定閾値 40 を挟むスコア帯 35-55 の中心。この近傍が最も情報量が大きい

// 未ラベル作品だけを、境界帯に近い順 (|score − 45| 昇順、同値は入力順) に積む。
export function buildQueue(works) {
  return works
    .filter((w) => labelsOf(w).length === 0)
    .map((w, i) => ({ w, i, d: Math.abs(scoreOf(w) - BOUNDARY_CENTER) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(({ w }) => w);
}
