/**
 * Column definitions shared by the client table and the server query builder.
 *
 * Deliberately free of any database imports so client components can use it —
 * importing from `recordFilters.ts` would pull the Postgres client into the
 * browser bundle.
 */

/** Columns the per-column search boxes can target, in display order. */
export const SEARCH_FIELDS = [
  'timestamp',
  'businessUnit',
  'system',
  'direction',
  'integrationType',
  'orderReference',
  'recordId',
  'status',
  'responseCode',
  'attemptCount',
  'response',
] as const;

export type SearchField = (typeof SEARCH_FIELDS)[number];

/** URL param name for a column's search box. */
export function searchParamName(field: SearchField | string): string {
  return `s_${field}`;
}
