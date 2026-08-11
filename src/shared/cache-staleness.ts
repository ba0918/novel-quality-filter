export const CURRENT_SCHEMA_VERSION = 8;

export function isCacheStale(schemaVersion: number | undefined): boolean {
  return schemaVersion === undefined || schemaVersion < CURRENT_SCHEMA_VERSION;
}
