import { and, gte, lte, inArray, eq, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { integrationRecords, accounts, userAccounts } from '@/db/schema';
import { SEARCH_FIELDS, searchParamName, type SearchField } from '@/lib/recordColumns';

export { SEARCH_FIELDS, searchParamName };
export type { SearchField };

/**
 * Filter logic shared by the Integration Log table and the export endpoint.
 *
 * Keeping it in one place matters for more than tidiness: if the export built
 * its own WHERE clause it could drift from the table (confusing) or forget the
 * account scoping (an access-control hole).
 */

/**
 * How each column is matched as text. Numeric and date columns are cast so a
 * single ILIKE strategy covers every box, and the timestamp is formatted to
 * match what the table actually displays.
 */
function fieldExpr(field: SearchField): SQL {
  switch (field) {
    case 'timestamp':
      return sql`to_char(${integrationRecords.timestamp}, 'DD/MM/YYYY HH24:MI')`;
    case 'businessUnit':
      return sql`coalesce(${integrationRecords.businessUnit}, '')`;
    case 'system':
      return sql`coalesce(${integrationRecords.system}, '')`;
    case 'direction':
      return sql`coalesce(${integrationRecords.direction}, '')`;
    case 'integrationType':
      return sql`${integrationRecords.integrationType}`;
    case 'orderReference':
      return sql`coalesce(${integrationRecords.orderReference}, '')`;
    case 'recordId':
      return sql`coalesce(${integrationRecords.recordId}, '')`;
    case 'status':
      return sql`${integrationRecords.status}`;
    case 'responseCode':
      return sql`coalesce(${integrationRecords.responseCode}::text, '')`;
    case 'attemptCount':
      // RETRIES is displayed as attempts minus the one that produced the result.
      return sql`greatest(${integrationRecords.attemptCount} - 1, 0)::text`;
    case 'response':
      return sql`coalesce(${integrationRecords.responseDescription}, ${integrationRecords.response}, '')`;
  }
}

/**
 * Treat the user's text as a literal substring: escape the LIKE wildcards so
 * typing "100%" searches for "100%" rather than matching everything.
 */
function contains(expr: SQL, term: string): SQL {
  const escaped = term.replace(/([\\%_])/g, '\\$1');
  return sql`${expr} ILIKE ${'%' + escaped + '%'} ESCAPE '\\'`;
}

export type RecordQueryParams = Record<string, string | undefined>;

/**
 * Accounts this session is allowed to see. Admins see everything.
 *
 * Inactive accounts are excluded everywhere — that is the single chokepoint
 * that keeps them out of grids, dropdowns, filters and exports. Only the
 * Account Management screen asks for them, via its own admin-only query.
 */
export async function getVisibleAccounts(session: { sub: string; role: string }) {
  if (session.role === 'admin') {
    return db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.isActive, true))
      .orderBy(accounts.name);
  }
  return db
    .select({ id: accounts.id, name: accounts.name })
    .from(userAccounts)
    .innerJoin(accounts, eq(userAccounts.accountId, accounts.id))
    .where(and(eq(userAccounts.userId, Number(session.sub)), eq(accounts.isActive, true)))
    .orderBy(accounts.name);
}

export type BuiltFilters = {
  where: SQL | undefined;
  customerId: number | null;
  from: string;
  to: string;
};

/**
 * Build the WHERE clause for a request. `accountIds` is the set the session may
 * see; a `customer` outside that set is ignored rather than honoured.
 */
export function buildRecordFilters(sp: RecordQueryParams, accountIds: number[]): BuiltFilters {
  const conditions: SQL[] = [];

  const requestedCustomer = Number(sp.customer);
  const customerId =
    Number.isFinite(requestedCustomer) && accountIds.includes(requestedCustomer)
      ? requestedCustomer
      : null;

  if (!accountIds.length) {
    conditions.push(sql`false`);
  } else if (customerId !== null) {
    conditions.push(eq(integrationRecords.accountId, customerId));
  } else {
    conditions.push(inArray(integrationRecords.accountId, accountIds));
  }

  if (sp.integration && sp.integration !== 'ALL') {
    conditions.push(eq(integrationRecords.integrationType, sp.integration));
  }
  if (sp.result && sp.result !== 'ALL') {
    conditions.push(eq(integrationRecords.status, sp.result));
  }

  // `date` is the older single-day param, kept working for Overview
  // drill-through links and existing bookmarks.
  const from = sp.from || sp.date || '';
  const to = sp.to || sp.date || '';

  const fromDate = from ? new Date(from + 'T00:00:00') : null;
  if (fromDate && !isNaN(fromDate.getTime())) {
    conditions.push(gte(integrationRecords.timestamp, fromDate));
  }
  const toDate = to ? new Date(to + 'T00:00:00') : null;
  if (toDate && !isNaN(toDate.getTime())) {
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(integrationRecords.timestamp, toDate));
  }

  // Global search: match any searchable column.
  const q = (sp.q ?? '').trim();
  if (q) {
    const anyColumn = SEARCH_FIELDS.map((f) => contains(fieldExpr(f), q));
    const combined = or(...anyColumn);
    if (combined) conditions.push(combined);
  }

  // Per-column search: every non-empty box narrows the result further.
  for (const field of SEARCH_FIELDS) {
    const term = (sp[searchParamName(field)] ?? '').trim();
    if (term) conditions.push(contains(fieldExpr(field), term));
  }

  return { where: conditions.length ? and(...conditions) : undefined, customerId, from, to };
}
