export const CURRENT_SCHEMA_VERSION = 11;

export function isCacheStale(schemaVersion: number | undefined): boolean {
  return schemaVersion === undefined || schemaVersion < CURRENT_SCHEMA_VERSION;
}
