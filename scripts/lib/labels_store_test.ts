import { assertEquals } from "@std/assert";
import {
  datasetSiteWorkIds,
  parseLabels2,
  resolveSiteWorkId,
  setExcluded,
  setLabel,
  toggleTag,
  toLabelsJsonl,
} from "./labels_store.ts";

Deno.test("resolveSiteWorkId: URL・数値ID・接頭辞付きを同じ siteWorkId に正規化する", () => {
  assertEquals(resolveSiteWorkId("https://kakuyomu.jp/works/123"), "kakuyomu:123");
  assertEquals(resolveSiteWorkId("https://kakuyomu.jp/works/123/episodes/9"), "kakuyomu:123");
  assertEquals(resolveSiteWorkId("123"), "kakuyomu:123");
  assertEquals(resolveSiteWorkId("kakuyomu:123"), "kakuyomu:123");
});

Deno.test("setLabel: 品質ラベルを付与し、更新は同一作品1行で上書きする（last-write-wins）", () => {
  let records = setLabel([], "kakuyomu:123", "良", "2026-08-10T00:00:00.000Z");
  assertEquals(records.length, 1);
  assertEquals(records[0].quality, "良");
  assertEquals(records[0].scope, "対象");

  records = setLabel(records, "kakuyomu:123", "ゴミ", "2026-08-10T01:00:00.000Z");
  assertEquals(records.length, 1); // 1作品1行
  assertEquals(records[0].quality, "ゴミ");
  assertEquals(records[0].updatedAt, "2026-08-10T01:00:00.000Z");
});

Deno.test("setLabel: 対象外はスコープ軸に載せ、品質の良/ゴミには混ぜない", () => {
  const records = setLabel([], "kakuyomu:123", "対象外", "t");
  assertEquals(records[0].scope, "対象外");
  assertEquals(records[0].quality, undefined);
});

Deno.test("toggleTag: タグの付け外しができる（+で付与・-で除去）", () => {
  let records = toggleTag([], "kakuyomu:123", "+すり抜け", "t");
  assertEquals(records[0].tags, ["すり抜け"]);
  records = toggleTag(records, "kakuyomu:123", "+ハードネガティブ", "t");
  assertEquals(records[0].tags, ["すり抜け", "ハードネガティブ"]);
  records = toggleTag(records, "kakuyomu:123", "-すり抜け", "t");
  assertEquals(records[0].tags, ["ハードネガティブ"]);
});

Deno.test("setExcluded: 論理除外フラグを立てる（原本は消さない・分析からのみ外す）", () => {
  const records = setExcluded([], "kakuyomu:123", true, "t");
  assertEquals(records[0].excluded, true);
});

Deno.test("parseLabels2: 旧形式（label:良/ゴミ/対象外）を2軸へ正規化して読む（後方互換）", () => {
  const legacy = [
    JSON.stringify({ workId: "111", label: "良", note: "面白い" }),
    JSON.stringify({ workId: "222", label: "ゴミ" }),
    JSON.stringify({ workId: "333", label: "対象外", note: "題材が好みでない" }),
  ].join("\n");
  const records = parseLabels2(legacy);
  assertEquals(records.length, 3);
  const byId = new Map(records.map((r) => [r.siteWorkId, r]));
  assertEquals(byId.get("kakuyomu:111")?.quality, "良");
  assertEquals(byId.get("kakuyomu:111")?.scope, "対象");
  assertEquals(byId.get("kakuyomu:111")?.note, "面白い");
  assertEquals(byId.get("kakuyomu:222")?.quality, "ゴミ");
  assertEquals(byId.get("kakuyomu:333")?.scope, "対象外");
  assertEquals(byId.get("kakuyomu:333")?.quality, undefined);
});

Deno.test("toLabelsJsonl→parseLabels2: 新形式が往復する", () => {
  const records = setExcluded(
    toggleTag(
      setLabel([], "kakuyomu:123", "良", "2026-08-10T00:00:00.000Z"),
      "kakuyomu:123",
      "+すり抜け",
      "2026-08-10T00:00:00.000Z",
    ),
    "kakuyomu:123",
    true,
    "2026-08-10T00:00:00.000Z",
  );
  const [back] = parseLabels2(toLabelsJsonl(records));
  assertEquals(back, records[0]);
});

Deno.test("datasetSiteWorkIds: 新旧レコードから既知の siteWorkId 集合を作る（存在検証用）", () => {
  const ds = [
    // deno-lint-ignore no-explicit-any
    { workId: "111", siteWorkId: "kakuyomu:111" } as any,
    // 旧レコードは siteWorkId 欠損 → workId から導出する。
    // deno-lint-ignore no-explicit-any
    { workId: "222" } as any,
  ];
  const set = datasetSiteWorkIds(ds);
  assertEquals(set.has("kakuyomu:111"), true);
  assertEquals(set.has("kakuyomu:222"), true);
});
