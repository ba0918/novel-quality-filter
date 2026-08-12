export const CURRENT_SCHEMA_VERSION = 12;

export function isCacheStale(schemaVersion: number | undefined): boolean {
  return schemaVersion === undefined || schemaVersion < CURRENT_SCHEMA_VERSION;
}
