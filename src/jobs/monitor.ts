import 'dotenv/config';
import { and, gte, inArray, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { accounts, integrationRecords } from '../db/schema';
import type { MonitorSource, RawEvent } from './types';
import { MockSource } from './sources/mock';
import { HttpSource } from './sources/http';

type InsertRecord = typeof integrationRecords.$inferInsert;

const DRY_RUN = ['1', 'true', 'yes'].includes(
  (process.env.MONITOR_DRY_RUN || '').toLowerCase(),
);
const CREATE_ACCOUNTS = !['0', 'false', 'no'].includes(
  (process.env.MONITOR_CREATE_ACCOUNTS || 'true').toLowerCase(),
);
const LOOKBACK_HOURS = Number(process.env.MONITOR_LOOKBACK_HOURS || '24');
const BATCH_SIZE = Number(process.env.MONITOR_BATCH_SIZE || '500');

function selectSource(): MonitorSource {
  const name = (process.env.MONITOR_SOURCE || 'mock').toLowerCase();
  switch (name) {
    case 'mock':
      return new MockSource();
    case 'http':
      return new HttpSource();
    default:
      throw new Error(
        `Unknown MONITOR_SOURCE "${name}" (expected "http" or "mock")`,
      );
  }
}

function normStatus(s: unknown): string {
  const v = String(s ?? '').trim().toLowerCase();
  if (['success', 'succeeded', 'ok', 'true', '200'].includes(v)) return 'Success';
  if (['failed', 'failure', 'error', 'false'].includes(v)) return 'Failed';
  return String(s ?? '').trim() || 'Failed';
}

function normDirection(d: unknown): string | null {
  const v = String(d ?? '').trim().toLowerCase();
  if (['in', 'inbound', 'incoming'].includes(v)) return 'In';
  if (['out', 'outbound', 'outgoing'].includes(v)) return 'Out';
  return d ? String(d) : null;
}

function toDate(t: string | Date): Date | null {
  const d = t instanceof Date ? t : new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function dedupKey(accountId: number | null, e: { integrationType: string; recordId?: string | null; timestamp: Date }): string {
  return [accountId ?? '', e.integrationType, e.recordId ?? '', e.timestamp.toISOString()].join('|');
}

async function buildAccountResolver() {
  const rows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts);
  const cache = new Map<string, number>();
  for (const r of rows) cache.set(r.name, r.id);

  return async function resolve(name?: string | null): Promise<number | null> {
    if (!name) return null;
    const hit = cache.get(name);
    if (hit !== undefined) return hit;
    if (!CREATE_ACCOUNTS) {
      console.warn(`  ! unknown account "${name}" (MONITOR_CREATE_ACCOUNTS=false) -> accountId=null`);
      return null;
    }
    if (DRY_RUN) {
      console.log(`  + would create account "${name}"`);
      cache.set(name, -1);
      return -1;
    }
    const [row] = await db
      .insert(accounts)
      .values({ name })
      .onConflictDoNothing()
      .returning();
    const id = row?.id ?? (await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, name)))[0].id;
    cache.set(name, id);
    console.log(`  + created account "${name}" (id=${id})`);
    return id;
  };
}

async function main() {
  const source = selectSource();
  console.log(`[monitor] source=${source.name} dryRun=${DRY_RUN} createAccounts=${CREATE_ACCOUNTS}`);

  const [{ max }] = await db
    .select({ max: sql<string | null>`max(${integrationRecords.timestamp})` })
    .from(integrationRecords);
  let since: Date | null = max ? new Date(max) : null;
  if (!since && LOOKBACK_HOURS > 0) {
    since = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000);
  }
  console.log(`[monitor] checkpoint (since): ${since ? since.toISOString() : 'none (full)'}`);

  const raw = await source.fetchSince(since);
  console.log(`[monitor] fetched ${raw.length} raw event(s)`);

  const resolve = await buildAccountResolver();
  const candidates: InsertRecord[] = [];
  const seen = new Set<string>();
  let skippedOld = 0;
  let skippedInvalid = 0;

  for (const e of raw as RawEvent[]) {
    const ts = toDate(e.timestamp);
    if (!ts) {
      skippedInvalid++;
      continue;
    }
    if (!e.integrationType || !String(e.integrationType).trim()) {
      skippedInvalid++;
      continue;
    }
    if (since && ts <= since) {
      skippedOld++;
      continue;
    }
    const accountId = await resolve(e.accountName);
    const rec: InsertRecord = {
      timestamp: ts,
      businessUnit: e.businessUnit ?? null,
      system: e.system ?? null,
      accountId: accountId === -1 ? null : accountId,
      direction: normDirection(e.direction),
      integrationType: String(e.integrationType).trim(),
      recordId: e.recordId ?? null,
      status: normStatus(e.status),
      response: e.response ?? null,
    };
    const key = dedupKey(rec.accountId ?? null, { integrationType: rec.integrationType, recordId: rec.recordId, timestamp: ts });
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(rec);
  }

  console.log(
    `[monitor] ${candidates.length} candidate(s) after normalise ` +
      `(skipped ${skippedOld} at/-before checkpoint, ${skippedInvalid} invalid)`,
  );

  let toInsert = candidates;
  if (candidates.length) {
    const minTs = candidates.reduce((m, r) => ((r.timestamp as Date) < m ? (r.timestamp as Date) : m), candidates[0].timestamp as Date);
    const accountIds = [...new Set(candidates.map((r) => r.accountId).filter((v): v is number => v != null))];
    const existing = await db
      .select({
        accountId: integrationRecords.accountId,
        integrationType: integrationRecords.integrationType,
        recordId: integrationRecords.recordId,
        timestamp: integrationRecords.timestamp,
      })
      .from(integrationRecords)
      .where(
        accountIds.length
          ? and(gte(integrationRecords.timestamp, minTs), inArray(integrationRecords.accountId, accountIds))
          : gte(integrationRecords.timestamp, minTs),
      );
    const existingKeys = new Set(
      existing.map((r) => dedupKey(r.accountId ?? null, { integrationType: r.integrationType, recordId: r.recordId, timestamp: new Date(r.timestamp) })),
    );
    toInsert = candidates.filter(
      (r) => !existingKeys.has(dedupKey(r.accountId ?? null, { integrationType: r.integrationType, recordId: r.recordId, timestamp: r.timestamp as Date })),
    );
    const dupes = candidates.length - toInsert.length;
    if (dupes) console.log(`[monitor] ${dupes} candidate(s) already present, skipping`);
  }

  if (!toInsert.length) {
    console.log('[monitor] nothing new to insert.');
  } else if (DRY_RUN) {
    console.log(`[monitor] DRY RUN — would insert ${toInsert.length} record(s):`);
    for (const r of toInsert.slice(0, 20)) {
      console.log(`    ${(r.timestamp as Date).toISOString()}  ${r.integrationType}  ${r.status}  ${r.recordId ?? ''}`);
    }
    if (toInsert.length > 20) console.log(`    ... and ${toInsert.length - 20} more`);
  } else {
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      await db.insert(integrationRecords).values(toInsert.slice(i, i + BATCH_SIZE));
    }
    console.log(`[monitor] inserted ${toInsert.length} record(s).`);
  }

  console.log('[monitor] done.');
  process.exit(0);
}

main().catch((e) => {
  console.error('[monitor] failed:', e);
  process.exit(1);
});
