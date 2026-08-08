import { assertEquals } from "@std/assert";
import { detectWorkPage } from "./work-page-detector.ts";

Deno.test("work_page_detector: detects work page and extracts workId", () => {
  const result = detectWorkPage("/works/16818093085498516000");
  assertEquals(result, "16818093085498516000");
});

Deno.test("work_page_detector: detects work page with trailing slash", () => {
  const result = detectWorkPage("/works/16818093085498516000/");
  assertEquals(result, "16818093085498516000");
});

Deno.test("work_page_detector: rejects episode page", () => {
  const result = detectWorkPage("/works/16818093085498516000/episodes/16818093085521654000");
  assertEquals(result, null);
});

Deno.test("work_page_detector: rejects reviews page", () => {
  const result = detectWorkPage("/works/16818093085498516000/reviews");
  assertEquals(result, null);
});

Deno.test("work_page_detector: rejects rankings page", () => {
  const result = detectWorkPage("/rankings/daily");
  assertEquals(result, null);
});

Deno.test("work_page_detector: rejects search page", () => {
  const result = detectWorkPage("/search?q=test");
  assertEquals(result, null);
});

Deno.test("work_page_detector: rejects root page", () => {
  const result = detectWorkPage("/");
  assertEquals(result, null);
});

Deno.test("work_page_detector: rejects works listing page", () => {
  const result = detectWorkPage("/works");
  assertEquals(result, null);
});
