import { parseHTML } from "linkedom";

export function loadFixture(name: string): Document {
  const html = Deno.readTextFileSync(`tests/fixtures/${name}`);
  const { document } = parseHTML(html);
  return document;
}
