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

  // Count first so an out-of-range page (hand-edited URL, or a filter that
  // shrank the result set) can be clamped instead of showing an empty table.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(integrationRecords)
    .where(whereClause);

  const requestedSize = Number(sp.size);
  const pageSize = ALLOWED_PAGE_SIZES.includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(count / pageSize)) : 1;
  const requestedPage = Number(sp.page);
  const page = Number.isFinite(requestedPage) && requestedPage >= 1
    ? Math.min(Math.trunc(requestedPage), totalPages)
    : 1;
  const offset = pageSize > 0 ? (page - 1) * pageSize : 0;

  const rows = await db
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
    .limit(pageSize > 0 ? pageSize : count || 1)
    .offset(offset);

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

  // Options for the INTEGRATION dropdown, taken from the data this session can
  // actually see rather than a hardcoded list that may not match reality.
  const typeRows = await db
    .selectDistinct({ type: integrationRecords.integrationType })
    .from(integrationRecords)
    .where(accountIds.length ? inArray(integrationRecords.accountId, accountIds) : sql`false`)
    .orderBy(integrationRecords.integrationType);
  const integrationOptions = typeRows.map((t) => t.type).filter(Boolean);

  return (
    <LogView
      accountsList={visibleAccounts}
      integrationOptions={integrationOptions}
      rows={rowsSerialized}
      total={count}
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
