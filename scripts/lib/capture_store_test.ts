import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { join } from "@std/path";
import {
  type Capture,
  captureDir,
  type CaptureManifest,
  loadCapture,
  makeCaptureId,
  saveCapture,
  siteWorkId,
} from "./capture_store.ts";

const BODY = '<div class="widget-episodeBody"><p>あいうえお。</p><p>かきくけこ。</p></div>';

function manifest(overrides: Partial<CaptureManifest> = {}): CaptureManifest {
  return {
    captureId: "2026-08-10T00-00-00-000Z",
    site: "kakuyomu",
    workId: "123",
    siteWorkId: "kakuyomu:123",
    fetched: [
      {
        episodeId: "1",
        url: "https://kakuyomu.jp/works/123/episodes/1",
        order: 0,
        file: "000_1.html",
      },
      {
        episodeId: "2",
        url: "https://kakuyomu.jp/works/123/episodes/2",
        order: 1,
        file: "001_2.html",
      },
    ],
    decision: {
      sampledCount: 2,
      targetEpisodeIndex: 0,
      openingType: "normal",
      concatOrder: [0],
    },
    pipelineVersion: "line-meta-1",
    capturedAt: "2026-08-10T00:00:00.000Z",
    health: { healthy: true },
    ...overrides,
  };
}

function capture(m: CaptureManifest = manifest()): Capture {
  return {
    manifest: m,
    pages: m.fetched.map((f) => ({ entry: f, html: `<!-- ${f.episodeId} -->${BODY}` })),
  };
}

Deno.test("siteWorkId: サイト接頭辞を付ける（なろう対応時のID衝突回避）", () => {
  assertEquals(siteWorkId("kakuyomu", "123"), "kakuyomu:123");
});

Deno.test("saveCapture→loadCapture: 生HTMLと manifest が往復で完全一致する", async () => {
  const base = await Deno.makeTempDir();
  try {
    const cap = capture();
    await saveCapture(base, cap);
    const loaded = await loadCapture(captureDir(base, "kakuyomu", "123", cap.manifest.captureId));
    assertEquals(loaded.manifest, cap.manifest);
    assertEquals(loaded.pages.map((p) => p.html), cap.pages.map((p) => p.html));
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("loadCapture: 順序の正は manifest 一箇所（ファイル名を並べ替えても manifest 順で復元）", async () => {
  const base = await Deno.makeTempDir();
  try {
    // manifest では file 名の連番と逆順（order で 2 話目を先頭に）にしても、
    // 読み込みは manifest.fetched の並び順で返す。
    const m = manifest({
      fetched: [
        { episodeId: "2", url: "u2", order: 0, file: "zzz.html" },
        { episodeId: "1", url: "u1", order: 1, file: "aaa.html" },
      ],
    });
    const cap = capture(m);
    await saveCapture(base, cap);
    const loaded = await loadCapture(captureDir(base, "kakuyomu", "123", m.captureId));
    assertEquals(loaded.pages.map((p) => p.entry.episodeId), ["2", "1"]);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("saveCapture: 本文抽出できないHTMLは原本として保存しない（C5）", async () => {
  const base = await Deno.makeTempDir();
  try {
    const bad: Capture = {
      manifest: manifest(),
      pages: [
        { entry: manifest().fetched[0], html: "<html><body><h1>年齢確認</h1></body></html>" },
        { entry: manifest().fetched[1], html: `<!-- 2 -->${BODY}` },
      ],
    };
    await assertRejects(() => saveCapture(base, bad));
    // 不良を含むキャプチャは一切書き込まない（原本の部分保存を避ける）。
    await assertRejects(
      () => loadCapture(captureDir(base, "kakuyomu", "123", bad.manifest.captureId)),
    );
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("saveCapture: 同一作品の再取得は上書きでなく別 captureId のサブディレクトリに保存する", async () => {
  const base = await Deno.makeTempDir();
  try {
    const first = capture(manifest({ captureId: "cap-A" }));
    const second = capture(manifest({ captureId: "cap-B" }));
    await saveCapture(base, first);
    await saveCapture(base, second);
    const a = await loadCapture(captureDir(base, "kakuyomu", "123", "cap-A"));
    const b = await loadCapture(captureDir(base, "kakuyomu", "123", "cap-B"));
    assertEquals(a.manifest.captureId, "cap-A");
    assertEquals(b.manifest.captureId, "cap-B");
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("captureDir: workId のパストラバーサルを拒否する", () => {
  assertThrows(() => captureDir("/tmp/base", "kakuyomu", "../../etc", "cap"));
});

// assertRejects の message 引数で、拒否が「我々の検証」由来であることを固定する。
// 存在しないディレクトリ等の副次的な FS エラーで偶然 reject するのを合格と誤認しないため。
const UNSAFE = "Unsafe capture file";

Deno.test("saveCapture: file 名にパス区切りを含む原本を書き込まない（キャプチャ外への書き込み防止）", async () => {
  const base = await Deno.makeTempDir();
  try {
    const m = manifest({
      fetched: [{ episodeId: "1", url: "u1", order: 0, file: "sub/000_1.html" }],
    });
    await assertRejects(() => saveCapture(base, capture(m)), Error, UNSAFE);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("saveCapture: file 名の .. トラバーサルを拒否する", async () => {
  const base = await Deno.makeTempDir();
  try {
    const m = manifest({
      fetched: [{ episodeId: "1", url: "u1", order: 0, file: "../escape.html" }],
    });
    await assertRejects(() => saveCapture(base, capture(m)), Error, UNSAFE);
    // キャプチャ親ディレクトリ側へ書き出していないこと。
    await assertRejects(() => Deno.stat(join(base, "pages", "kakuyomu_123", "escape.html")));
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("saveCapture: file 名の絶対パスを拒否する", async () => {
  const base = await Deno.makeTempDir();
  try {
    const m = manifest({
      fetched: [{ episodeId: "1", url: "u1", order: 0, file: "/etc/passwd" }],
    });
    await assertRejects(() => saveCapture(base, capture(m)), Error, UNSAFE);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("loadCapture: manifest の file 名がキャプチャ外を指す場合は読み込みを拒否する", async () => {
  const base = await Deno.makeTempDir();
  try {
    const dir = captureDir(base, "kakuyomu", "123", "cap");
    await Deno.mkdir(dir, { recursive: true });
    // saveCapture を通さず、悪意ある file 名を持つ manifest を直に書き込む。
    const m = manifest({
      captureId: "cap",
      fetched: [{ episodeId: "1", url: "u1", order: 0, file: "../../../../etc/passwd" }],
    });
    await Deno.writeTextFile(join(dir, "manifest.json"), JSON.stringify(m));
    await assertRejects(() => loadCapture(dir), Error, UNSAFE);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

// pages 側の検証だけでは manifest.fetched に混入した不正 file を素通しするため、
// 双方を独立に検証する。この message で「manifest.fetched 由来の拒否」を固定する。
const MISMATCH = "Manifest fetched entries do not match pages";

Deno.test("saveCapture: manifest.fetched の file がキャプチャ外を指す場合は保存しない（pages 側が安全でも）", async () => {
  const base = await Deno.makeTempDir();
  try {
    const cap: Capture = {
      manifest: manifest({
        fetched: [{ episodeId: "1", url: "u1", order: 0, file: "../../evil" }],
      }),
      pages: [{ entry: { episodeId: "1", url: "u1", order: 0, file: "000_1.html" }, html: BODY }],
    };
    await assertRejects(() => saveCapture(base, cap), Error, UNSAFE);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("saveCapture: pages と manifest.fetched が食い違う場合は保存しない（順序の正の一貫性）", async () => {
  const base = await Deno.makeTempDir();
  try {
    // file 値の不一致（双方とも安全なファイル名だが、順序の正が二重化して食い違う）。
    const fileMismatch: Capture = {
      manifest: manifest({
        fetched: [{ episodeId: "1", url: "u1", order: 0, file: "000_1.html" }],
      }),
      pages: [{ entry: { episodeId: "1", url: "u1", order: 0, file: "999_x.html" }, html: BODY }],
    };
    await assertRejects(() => saveCapture(base, fileMismatch), Error, MISMATCH);

    // 件数の不一致。
    const countMismatch: Capture = {
      manifest: manifest({
        fetched: [{ episodeId: "1", url: "u1", order: 0, file: "000_1.html" }],
      }),
      pages: [
        { entry: { episodeId: "1", url: "u1", order: 0, file: "000_1.html" }, html: BODY },
        { entry: { episodeId: "2", url: "u2", order: 1, file: "001_2.html" }, html: BODY },
      ],
    };
    await assertRejects(() => saveCapture(base, countMismatch), Error, MISMATCH);
  } finally {
    await Deno.remove(base, { recursive: true });
  }
});

Deno.test("makeCaptureId: 取得日時から決定的にファイル名安全なIDを作る", () => {
  const id = makeCaptureId(new Date("2026-08-10T07:47:15.123Z"));
  assertEquals(id, "2026-08-10T07-47-15-123Z");
});
