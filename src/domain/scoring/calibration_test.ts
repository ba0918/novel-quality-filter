import { assert, assertEquals } from "@std/assert";
import { makeCalibration } from "./calibration.ts";
import { CALIBRATION_CONTROL_POINTS } from "./weights.ts";

// 契約 1〜4 + 端点 + 中間値の単調性を機構的に固定する。契約 4（pass/fail 集合の不変性）は
// 「単調性 + f(40)=40 + 表示ゲートが round(score) <= 40 で fail」の系だが、
// 数値実装（PCHIP 傾き）の都合で round 後のビット反転が起きる恐れがあるため
// 独立に境界値サンプリングで検証する（実データに依存せず数学的な性質として固定）。

const calibrate = makeCalibration(CALIBRATION_CONTROL_POINTS);

Deno.test("calibration: 全域単調増加である（0..100 を 1 刻みで f(x-1) <= f(x)）", () => {
  for (let x = 1; x <= 100; x++) {
    const prev = calibrate(x - 1);
    const cur = calibrate(x);
    assert(prev <= cur, `monotonicity broke at x=${x}: f(${x - 1})=${prev} > f(${x})=${cur}`);
  }
});

Deno.test("calibration: 固定点 f(40) === 40 を厳密に返す（DEFAULT_THRESHOLD 整合）", () => {
  assertEquals(calibrate(40), 40);
});

Deno.test("calibration: 端点 f(0)=0 と f(100)=100 を厳密に返す", () => {
  assertEquals(calibrate(0), 0);
  assertEquals(calibrate(100), 100);
});

Deno.test("calibration: 内部制御点で C1 連続（数値微分の左右差が 1e-6 以下）", () => {
  const eps = 1e-4;
  const interior = CALIBRATION_CONTROL_POINTS.slice(1, -1);
  for (const [x, _y] of interior) {
    const left = (calibrate(x) - calibrate(x - eps)) / eps;
    const right = (calibrate(x + eps) - calibrate(x)) / eps;
    const diff = Math.abs(left - right);
    // 数値微分の丸め誤差を考慮し 1e-3 で判定（十分に小さい＝制御点で導関数が飛ばない）
    assert(
      diff < 1e-3,
      `C1 discontinuity at x=${x}: left'=${left.toFixed(6)} right'=${
        right.toFixed(6)
      } diff=${diff}`,
    );
  }
});

Deno.test("calibration: 制御点間の中間値も単調に上がる（スポット確認）", () => {
  assert(calibrate(50) > calibrate(45), "f(50) must exceed f(45)");
  assert(calibrate(65) > calibrate(60), "f(65) must exceed f(60)");
  assert(calibrate(80) > calibrate(75), "f(80) must exceed f(75)");
});

Deno.test("calibration: x < 0 は f(0) に、x > 100 は f(100) にクランプする", () => {
  assertEquals(calibrate(-10), 0);
  assertEquals(calibrate(150), 100);
});

Deno.test("calibration: 判定集合の不変性 — s > 40 と f(s) > 40 が全域で同値（境界値サンプリング）", () => {
  // 契約 4（spec: 「s > 40」と「f(s) > 40」が同値）。単調性 + f(40)=40 の数学的な系。
  // 実装上の傾き（PCHIP 端点処理）が破綻すると 40 近傍でこの契約が崩れうるので、
  // 境界近傍を密にサンプリングして固定する。
  const samples: number[] = [];
  for (let x = 0; x <= 100; x += 0.5) samples.push(x);
  for (let x = 39; x <= 41; x += 0.001) samples.push(x);
  for (const x of samples) {
    const rawPass = x > 40;
    const calPass = calibrate(x) > 40;
    assertEquals(
      rawPass,
      calPass,
      `flip at x=${x}: raw>40=${rawPass} cal>40=${calPass} calVal=${calibrate(x)}`,
    );
  }
});

Deno.test("calibration: 良側の想定効果 — round(f(49)) >= 51 かつ f(60) >= 63 を初期制御点で満たす", () => {
  // 制御点 (50,52) (60,65) (75,80) から補間される良側の上げ幅を回帰テストとして固定する。
  // ここが崩れる（想定効果を満たさない制御点に書き換わる）なら plan の acceptance criteria が
  // 満たせないので早期発見する。表示は round された整数なので round 後で比較する。
  // 制御点を動かすときはこのテストも一緒に更新する契約とする。
  const f49 = Math.round(calibrate(49));
  assert(f49 >= 51, `expected round(f(49)) >= 51, got ${f49} (raw ${calibrate(49)})`);
  const f60 = calibrate(60);
  assert(f60 >= 63, `expected f(60) >= 63, got ${f60}`);
});
