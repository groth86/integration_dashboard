import { and, gte, lte, inArray, eq, desc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { integrationRecords, accounts, userAccounts } from '@/db/schema';
import { getSession } from '@/lib/auth';
import LogView from './LogView';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function IntegrationLogPage({
  searchParams,
}: {
  searchParams: Promise<{ integration?: string; date?: string; result?: string; customer?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;
  const sp = await searchParams;

  // Visible accounts
  let visibleAccounts: { id: number; name: string }[] = [];
  if (session.role === 'admin') {
    visibleAccounts = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).orderBy(accounts.name);
  } else {
    visibleAccounts = await db
      .select({ id: accounts.id, name: accounts.name })
      .from(userAccounts)
      .innerJoin(accounts, eq(userAccounts.accountId, accounts.id))
      .where(eq(userAccounts.userId, Number(session.sub)))
      .orderBy(accounts.name);
  }
  const accountIds = visibleAccounts.map((a) => a.id);

  const conditions = [] as any[];
  if (accountIds.length) {
    conditions.push(inArray(integrationRecords.accountId, accountIds));
  } else {
    // No accounts -> no data
    conditions.push(sql`false`);
  }

  if (sp.integration && sp.integration !== 'ALL') {
    conditions.push(eq(integrationRecords.integrationType, sp.integration));
  }
  if (sp.result && sp.result !== 'ALL') {
    conditions.push(eq(integrationRecords.status, sp.result));
  }
  if (sp.date) {
    const day = new Date(sp.date + 'T00:00:00');
    if (!isNaN(day.getTime())) {
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      conditions.push(gte(integrationRecords.timestamp, day));
      conditions.push(lte(integrationRecords.timestamp, dayEnd));
    }
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      timestamp: integrationRecords.timestamp,
      businessUnit: integrationRecords.businessUnit,
      system: integrationRecords.system,
      direction: integrationRecords.direction,
      integrationType: integrationRecords.integrationType,
      recordId: integrationRecords.recordId,
      status: integrationRecords.status,
      response: integrationRecords.response,
    })
    .from(integrationRecords)
    .where(whereClause)
    .orderBy(desc(integrationRecords.timestamp))
    .limit(PAGE_SIZE);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(integrationRecords)
    .where(whereClause);

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
      rows={rowsSerialized}
      total={count}
      pageSize={PAGE_SIZE}
      filters={{
        integration: sp.integration ?? 'ALL',
        result: sp.result ?? 'ALL',
        date: sp.date ?? '',
        customer: sp.customer ?? '',
      }}
      fromOverview={fromOverview}
    />
  );
}
