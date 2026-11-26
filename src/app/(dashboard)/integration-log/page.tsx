import { inArray, desc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { integrationRecords } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { buildRecordFilters, getVisibleAccounts, SEARCH_FIELDS, searchParamName } from '@/lib/recordFilters';
import LogView from './LogView';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 25;
const ALLOWED_PAGE_SIZES = [25, 50, 100, 0]; // 0 = All

export default async function IntegrationLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  if (!session) return null;
  const sp = await searchParams;

  const visibleAccounts = await getVisibleAccounts(session);
  const accountIds = visibleAccounts.map((a) => a.id);

  const { where: whereClause, customerId, from: fromRaw, to: toRaw } = buildRecordFilters(sp, accountIds);

  const requestedSize = Number(sp.size);
  const pageSize = ALLOWED_PAGE_SIZES.includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;

  const requestedPageRaw = Number(sp.page);
  const requestedPage =
    Number.isFinite(requestedPageRaw) && requestedPageRaw >= 1 ? Math.trunc(requestedPageRaw) : 1;

  // One page of records. Declared as a function so an out-of-range page can be
  // re-fetched once the real total is known (rare).
  const fetchRows = (offset: number, limit: number) =>
    db
      .select({
      id: integrationRecords.id,
      timestamp: integrationRecords.timestamp,
      businessUnit: integrationRecords.businessUnit,
      system: integrationRecords.system,
      direction: integrationRecords.direction,
      integrationType: integrationRecords.integrationType,
      recordId: integrationRecords.recordId,
      status: integrationRecords.status,
      response: integrationRecords.response,
      // Latest-outcome fields. Payloads are NOT selected here; the detail
      // panel loads them on demand from /api/records/:id.
      workflow: integrationRecords.workflow,
      orderReference: integrationRecords.orderReference,
      responseCode: integrationRecords.responseCode,
      responseDescription: integrationRecords.responseDescription,
      attemptCount: integrationRecords.attemptCount,
      hasPayload: sql<boolean>`${integrationRecords.payloadStoredAt} is not null`,
    })
      .from(integrationRecords)
      .where(whereClause)
      // Secondary sort on id keeps the order stable across pages when several
      // records share a timestamp — without it, rows can repeat or go missing.
      .orderBy(desc(integrationRecords.timestamp), desc(integrationRecords.id))
      .limit(limit)
      .offset(offset);

  // Everything below depends only on the filters, so it goes out in one batch
  // rather than five sequential round trips to the database. On a hosted
  // Postgres that network latency, not query time, is what makes the page feel
  // slow — the queries themselves are single-digit milliseconds.
  const NO_LIMIT = 100_000;
  const optimisticOffset = pageSize > 0 ? (requestedPage - 1) * pageSize : 0;

  const [countResult, statusRows, typeRows, optimisticRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(integrationRecords).where(whereClause),
    // Status breakdown for the summary tiles — same WHERE clause as the table,
    // so it reflects every active filter and counts all matching records.
    db
      .select({ status: integrationRecords.status, count: sql<number>`count(*)::int` })
      .from(integrationRecords)
      .where(whereClause)
      .groupBy(integrationRecords.status),
    // Options for the INTEGRATION dropdown, taken from data this session can
    // actually see rather than a hardcoded list that may not match reality.
    db
      .selectDistinct({ type: integrationRecords.integrationType })
      .from(integrationRecords)
      .where(accountIds.length ? inArray(integrationRecords.accountId, accountIds) : sql`false`)
      .orderBy(integrationRecords.integrationType),
    fetchRows(optimisticOffset, pageSize > 0 ? pageSize : NO_LIMIT),
  ]);

  const count = countResult[0].count;
  const integrationOptions = typeRows.map((t) => t.type).filter(Boolean);

  // Clamp only if the requested page turned out to be past the end — a second
  // query, but only in the uncommon case.
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(count / pageSize)) : 1;
  const page = Math.min(requestedPage, totalPages);
  const rows =
    page === requestedPage
      ? optimisticRows
      : await fetchRows(pageSize > 0 ? (page - 1) * pageSize : 0, pageSize > 0 ? pageSize : NO_LIMIT);

  const rowsSerialized = rows.map((r) => ({
    ...r,
    timestamp: new Date(r.timestamp).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));

  const fromOverview = Boolean(sp.integration);

  return (
    <LogView
      accountsList={visibleAccounts}
      integrationOptions={integrationOptions}
      rows={rowsSerialized}
      total={count}
      statusSummary={statusRows}
      pageSize={pageSize}
      page={page}
      filters={{
        integration: sp.integration ?? 'ALL',
        result: sp.result ?? 'ALL',
        date: sp.date ?? '',
        from: fromRaw,
        to: toRaw,
        q: sp.q ?? '',
        customer: customerId !== null ? String(customerId) : '',
      }}
      columnSearch={Object.fromEntries(
        SEARCH_FIELDS.map((f) => [f, sp[searchParamName(f)] ?? '']),
      )}
      fromOverview={fromOverview}
    />
  );
}
