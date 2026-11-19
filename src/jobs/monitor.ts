// npm run monitor — OPTIONAL pull job. Fetches record outcomes from a source
// adapter and upserts them exactly as POST /api/recordimport/fromflowgear does (latest outcome
// per record + attempt count). Not needed when Flowgear pushes to /api/recordimport/fromflowgear.
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { integrationRecords } from '../db/schema';
import type { MonitorSource } from './types';
import { MockSource } from './sources/mock';
import { HttpSource } from './sources/http';
import { normaliseRecord, upsertRecords, purgeExpiredPayloads, type NormalisedRecord } from '../lib/records';

const DRY_RUN = ['1', 'true', 'yes'].includes(
  (process.env.MONITOR_DRY_RUN || '').toLowerCase(),
);
const CREATE_ACCOUNTS = !['0', 'false', 'no'].includes(
  (process.env.MONITOR_CREATE_ACCOUNTS || 'true').toLowerCase(),
);
const LOOKBACK_HOURS = Number(process.env.MONITOR_LOOKBACK_HOURS || '24');

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

  const valid: NormalisedRecord[] = [];
  let skippedOld = 0;
  const skipped: string[] = [];
  for (const e of raw) {
    const r = normaliseRecord(e);
    if (typeof r === 'string') {
      skipped.push(r);
      continue;
    }
    if (since && r.timestamp <= since) {
      skippedOld++;
      continue;
    }
    valid.push(r);
  }
  console.log(
    `[monitor] ${valid.length} record(s) after normalise ` +
      `(skipped ${skippedOld} at/-before checkpoint, ${skipped.length} invalid)`,
  );
  for (const reason of skipped.slice(0, 10)) console.log(`    ! ${reason}`);

  if (!valid.length) {
    console.log('[monitor] nothing new.');
  } else if (DRY_RUN) {
    console.log(`[monitor] DRY RUN — would upsert ${valid.length} record(s):`);
    for (const r of valid.slice(0, 20)) {
      console.log(`    ${r.timestamp.toISOString()}  ${r.integrationType}  ${r.status}  ${r.recordId}`);
    }
    if (valid.length > 20) console.log(`    ... and ${valid.length - 20} more`);
  } else {
    const { upserted, unknownAccounts } = await upsertRecords(valid, { createAccounts: CREATE_ACCOUNTS });
    console.log(`[monitor] upserted ${upserted} record(s).`);
    for (const n of unknownAccounts) console.warn(`  ! unknown account "${n}" (MONITOR_CREATE_ACCOUNTS=false), skipped`);
    const purged = await purgeExpiredPayloads();
    if (purged) console.log(`[monitor] cleared expired payloads on ${purged} record(s).`);
  }

  console.log('[monitor] done.');
  process.exit(0);
}

main().catch((e) => {
  console.error('[monitor] failed:', e);
  process.exit(1);
});
