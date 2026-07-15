import { and, gte, lte, inArray, eq } from 'drizzle-orm';
import { db } from '@/db';
import { integrationRecords, accounts, userAccounts } from '@/db/schema';
import { getSession } from '@/lib/auth';
import OverviewGrid from './OverviewGrid';

export const dynamic = 'force-dynamic';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default async function OverviewPage() {
  const session = await getSession();
  if (!session) return null;

  // Accounts this user may see
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

  // Default window: trailing 8 days ending today
  const end = startOfDay(new Date());
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  const rangeEnd = new Date(end);
  rangeEnd.setHours(23, 59, 59, 999);

  const accountIds = visibleAccounts.map((a) => a.id);

  let records: { timestamp: Date; integrationType: string; status: string }[] = [];
  if (accountIds.length) {
    records = await db
      .select({
        timestamp: integrationRecords.timestamp,
        integrationType: integrationRecords.integrationType,
        status: integrationRecords.status,
      })
      .from(integrationRecords)
      .where(
        and(
          gte(integrationRecords.timestamp, start),
          lte(integrationRecords.timestamp, rangeEnd),
          inArray(integrationRecords.accountId, accountIds),
        ),
      );
  }

  // Build day columns
  const days: { key: string; label: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
    days.push({ key, label });
  }

  // Aggregate: integrationType -> dayKey -> { success, total }
  const agg: Record<string, Record<string, { success: number; total: number }>> = {};
  for (const r of records) {
    const dayKey = new Date(r.timestamp).toISOString().slice(0, 10);
    agg[r.integrationType] ??= {};
    agg[r.integrationType][dayKey] ??= { success: 0, total: 0 };
    agg[r.integrationType][dayKey].total += 1;
    if (r.status === 'Success') agg[r.integrationType][dayKey].success += 1;
  }

  const integrationTypes = Object.keys(agg).sort();

  return (
    <OverviewGrid
      accountsList={visibleAccounts}
      days={days}
      integrationTypes={integrationTypes}
      agg={agg}
      startLabel={start.toLocaleDateString('en-GB')}
      endLabel={end.toLocaleDateString('en-GB')}
    />
  );
}
