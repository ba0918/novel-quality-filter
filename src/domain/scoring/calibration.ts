// 表示スコア較正カーブ（集約段の 13 本目の normalize）。
// PCHIP（Piecewise Cubic Hermite Interpolating Polynomial, Fritsch-Carlson 1980）による
// 単調保持 3 次エルミート補間。制御点間の傾きを局所的に決めることでオーバーシュートせず、
// 単調性と C1 連続性を同時に保証する。
//
// 位置づけ: mod.ts の calculateScore の最終段（Math.round の前）に挟む純関数。
// normalizer.ts の 12 本の per-metric normalize とは責務が違う（12 本は指標変換、
// このカーブは集約段の表示尺度整形）。攻撃面ゼロ、外部依存ゼロ。
//
// 契約は calibration_test.ts で機構的に固定する:
//   1. 単調性: x1 < x2 -> f(x1) <= f(x2)
//   2. 固定点: f(40) === 40（DEFAULT_THRESHOLD 整合）
//   3. C1 連続: 制御点で導関数が連続
//   4. 判定集合の不変性: 任意 s について「s > 40」と「f(s) > 40」が同値（単調性+固定点の系）
//
// x < xs[0] は ys[0] に、x > xs[last] は ys[last] にクランプする（clamp 外挿）。

export type ControlPoint = readonly [number, number];

export function makeCalibration(
  controlPoints: ReadonlyArray<ControlPoint>,
): (x: number) => number {
  if (controlPoints.length < 2) {
    throw new Error("makeCalibration: at least 2 control points are required");
  }
  const xs = controlPoints.map(([x]) => x);
  const ys = controlPoints.map(([, y]) => y);
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] <= xs[i - 1]) {
      throw new Error(
        `makeCalibration: control points must be strictly increasing in x (xs[${i}]=${
          xs[i]
        } <= xs[${i - 1}]=${xs[i - 1]})`,
      );
    }
    if (ys[i] < ys[i - 1]) {
      throw new Error(
        `makeCalibration: control points must be monotone non-decreasing in y (ys[${i}]=${
          ys[i]
        } < ys[${i - 1}]=${ys[i - 1]})`,
      );
    }
  }

  const n = xs.length;
  const h = new Array<number>(n - 1);
  const d = new Array<number>(n - 1);
  for (let k = 0; k < n - 1; k++) {
    h[k] = xs[k + 1] - xs[k];
    d[k] = (ys[k + 1] - ys[k]) / h[k];
  }

  // Fritsch-Carlson 傾き算出。内部点は 3 点重み付き調和平均、端点は非中心 3 次公式。
  // 隣接区間の傾き符号が違う（または片方 0）なら m_k = 0 とし、単調性を保つ。
  const m = new Array<number>(n);
  m[0] = endpointSlope(h[0], h[1] ?? h[0], d[0], d[1] ?? d[0]);
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] === 0 || d[k] === 0 || sign(d[k - 1]) !== sign(d[k])) {
      m[k] = 0;
    } else {
      const w1 = 2 * h[k] + h[k - 1];
      const w2 = h[k] + 2 * h[k - 1];
      m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
    }
  }
  m[n - 1] = endpointSlope(h[n - 2], h[n - 3] ?? h[n - 2], d[n - 2], d[n - 3] ?? d[n - 2]);

  // Fritsch-Carlson の単調性制約: alpha^2 + beta^2 > 9 なら (m_k, m_{k+1}) を
  // 半径 3 の円内へ再スケールする。単調性の破綻を機構的に防ぐ。
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const alpha = m[k] / d[k];
    const beta = m[k + 1] / d[k];
    const s2 = alpha * alpha + beta * beta;
    if (s2 > 9) {
      const tau = 3 / Math.sqrt(s2);
      m[k] = tau * alpha * d[k];
      m[k + 1] = tau * beta * d[k];
    }
  }

  return (x: number): number => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    // 制御点そのものは端点として厳密に返す（f(40) === 40 の契約）
    // 二分探索で x の入る区間 k を見つける（xs[k] <= x < xs[k+1]）
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const k = lo;
    if (x === xs[k]) return ys[k];
    const hk = h[k];
    const t = (x - xs[k]) / hk;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ys[k] + h10 * hk * m[k] + h01 * ys[k + 1] + h11 * hk * m[k + 1];
  };
}

function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

// 端点の一次傾き。中心公式が使えないため非中心 3 次公式で近似し、符号が反転したら 0 に、
// 隣接区間傾きの 3 倍を超えたら 3 倍にクランプする（Fritsch-Carlson 標準の端点処理）。
function endpointSlope(h0: number, h1: number, d0: number, d1: number): number {
  const m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
  if (sign(m) !== sign(d0)) return 0;
  if (sign(d0) !== sign(d1) && Math.abs(m) > 3 * Math.abs(d0)) return 3 * d0;
  if (Math.abs(m) > 3 * Math.abs(d0)) return 3 * d0;
  return m;
}
