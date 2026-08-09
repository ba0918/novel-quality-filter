export function extractNarrative(text: string): string {
  return text.replace(/「[^」]*」/g, "");
}
