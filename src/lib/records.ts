// Shared write path for integration_records: used by POST /api/recordimport/fromflowgear and the
// pull job (src/jobs/monitor.ts). Keeps ONE row per record with its latest
// outcome and an attempt count, and clears payloads after a retention window.
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { accounts, integrationRecords } from '../db/schema';

export const PAYLOAD_CLEAR_AFTER_HOURS = Number(process.env.PAYLOAD_CLEAR_AFTER_HOURS || '24');
// Payloads longer than this are cut short (with a marker) before storing.
const MAX_PAYLOAD_CHARS = Number(process.env.PAYLOAD_TRUNCATE_AFTER_CHARS || '65536');
const MAX_TEXT_CHARS = 2000;

// What a caller (e.g. a Flowgear workflow) sends for one record outcome.
export interface IncomingRecord {
  timestamp?: string | Date | null;
  accountName?: string | null;
  businessUnit?: string | null;
  system?: string | null;
  direction?: string | null;
  integrationType?: string | null; // record type, e.g. "Sales Order"
  recordId?: string | null; // unique key, e.g. the Flowgear Key-Value key
  orderReference?: string | null;
  workflow?: string | null;
  status?: string | null;
  responseCode?: number | string | null;
  responseDescription?: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
  response?: string | null; // legacy short response
}

export type NormalisedRecord = {
  timestamp: Date;
  accountName: string;
  businessUnit: string | null;
  system: string | null;
  direction: string | null;
  integrationType: string;
  recordId: string;
  orderReference: string | null;
  workflow: string | null;
  status: 'Success' | 'Failed';
  responseCode: number | null;
  responseDescription: string | null;
  requestPayload: string | null;
  responsePayload: string | null;
  response: string | null;
  attempts: number; // outcomes folded into this one (>1 when a batch repeats a record)
};

function clean(v: unknown, max = MAX_TEXT_CHARS): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function payload(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s.length <= MAX_PAYLOAD_CHARS) return s;
  return s.slice(0, MAX_PAYLOAD_CHARS) + `\n…[truncated: ${s.length} chars, limit ${MAX_PAYLOAD_CHARS}]`;
}

export function normStatus(s: unknown): 'Success' | 'Failed' | 'InProgress' | null {
  const v = String(s ?? '').trim().toLowerCase();
  if (['success', 'succeeded', 'ok', 'true'].includes(v)) return 'Success';
  if (['failed', 'failure', 'error', 'false'].includes(v)) return 'Failed';
  if (['inprogress', 'in progress', 'in-progress', 'pending'].includes(v)) return 'InProgress';
  return null;
}

export function normDirection(d: unknown): string | null {
  const v = String(d ?? '').trim().toLowerCase();
  if (['in', 'inbound', 'incoming'].includes(v)) return 'In';
  if (['out', 'outbound', 'outgoing'].includes(v)) return 'Out';
  return clean(d, 20);
}

// Returns the normalised record, or a reason string when it must be skipped.
export function normaliseRecord(e: IncomingRecord): NormalisedRecord | string {
  if (!e || typeof e !== 'object') return 'not an object';
  const accountName = clean(e.accountName, 200);
  if (!accountName) return 'accountName is required';
  const integrationType = clean(e.integrationType, 100);
  if (!integrationType) return 'integrationType is required';
  const recordId = clean(e.recordId, 300) ?? clean(e.orderReference, 300);
  if (!recordId) return 'recordId (or orderReference) is required';

  const status = normStatus(e.status);
  if (status === null) return `unknown status "${e.status ?? ''}" (expected Success or Failed)`;
  // In-progress is not an outcome: ignoring it keeps attempt counts honest.
  if (status === 'InProgress') return 'status InProgress is not an outcome, ignored';

  let timestamp = new Date();
  if (e.timestamp) {
    const d = e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp);
    if (isNaN(d.getTime())) return `invalid timestamp "${e.timestamp}"`;
    timestamp = d;
  }

  let responseCode: number | null = null;
  if (e.responseCode !== undefined && e.responseCode !== null && String(e.responseCode).trim() !== '') {
    const n = Number(e.responseCode);
    if (!Number.isInteger(n)) return `invalid responseCode "${e.responseCode}"`;
    responseCode = n;
  }

  return {
    timestamp,
    accountName,
    businessUnit: clean(e.businessUnit, 200),
    system: clean(e.system, 200),
    direction: normDirection(e.direction),
    integrationType,
    recordId,
    orderReference: clean(e.orderReference, 300),
    workflow: clean(e.workflow, 300),
    status,
    responseCode,
    responseDescription: clean(e.responseDescription),
    requestPayload: payload(e.requestPayload),
    responsePayload: payload(e.responsePayload),
    response: clean(e.response),
    attempts: 1,
  };
}

async function resolveAccounts(names: string[], createMissing: boolean): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const unique = [...new Set(names)];
  if (!unique.length) return map;
  if (createMissing) {
    // Live data for an account reactivates it: receiving records means the
    // integration is running again, so hiding it would misrepresent reality.
    // Note the consequence — deactivating an account that is still sending
    // data will flip back on at the next delivery.
    await db
      .insert(accounts)
      .values(unique.map((name) => ({ name })))
      .onConflictDoUpdate({
        target: accounts.name,
        set: { isActive: true },
      });
  }
  const rows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts);
  const wanted = new Set(unique);
  for (const r of rows) if (wanted.has(r.name)) map.set(r.name, r.id);
  return map;
}

// Overwrite a column only when the incoming outcome is not older than the
// stored one, so late or out-of-order deliveries never replace a newer result.
function latest(col: string) {
  return sql.raw(
    `CASE WHEN excluded.timestamp >= integration_records.timestamp THEN excluded.${col} ELSE integration_records.${col} END`,
  );
}

export type UpsertResult = { upserted: number; unknownAccounts: string[] };

// Upsert record outcomes: one row per (account, integrationType, recordId).
export async function upsertRecords(
  records: NormalisedRecord[],
  opts: { createAccounts?: boolean } = {},
): Promise<UpsertResult> {
  if (!records.length) return { upserted: 0, unknownAccounts: [] };

  const accountIds = await resolveAccounts(
    records.map((r) => r.accountName),
    opts.createAccounts ?? true,
  );
  const unknownAccounts = [...new Set(records.map((r) => r.accountName).filter((n) => !accountIds.has(n)))];

  // Fold repeats of the same record within one batch into its latest outcome
  // (Postgres cannot update the same row twice in one INSERT ... ON CONFLICT).
  const folded = new Map<string, NormalisedRecord>();
  for (const r of records) {
    if (!accountIds.has(r.accountName)) continue;
    const key = `${accountIds.get(r.accountName)}\u0000${r.integrationType}\u0000${r.recordId}`;
    const prev = folded.get(key);
    if (!prev) folded.set(key, { ...r });
    else {
      const attempts = prev.attempts + r.attempts;
      const keep = r.timestamp >= prev.timestamp ? r : prev;
      folded.set(key, { ...keep, attempts });
    }
  }

  const rows = [...folded.values()].map((r) => {
    const hasPayload = r.requestPayload !== null || r.responsePayload !== null;
    return {
      timestamp: r.timestamp,
      businessUnit: r.businessUnit,
      system: r.system,
      accountId: accountIds.get(r.accountName)!,
      direction: r.direction,
      integrationType: r.integrationType,
      recordId: r.recordId,
      status: r.status,
      response: r.response,
      workflow: r.workflow,
      orderReference: r.orderReference,
      responseCode: r.responseCode,
      responseDescription: r.responseDescription,
      requestPayload: r.requestPayload,
      responsePayload: r.responsePayload,
      // UTC, like every other timestamp column (they are 'timestamp without time zone')
      payloadStoredAt: hasPayload ? sql`(now() at time zone 'utc')` : null,
      attemptCount: r.attempts,
      firstSeenAt: r.timestamp,
    };
  });

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(integrationRecords)
      .values(rows.slice(i, i + BATCH) as any)
      .onConflictDoUpdate({
        target: [integrationRecords.accountId, integrationRecords.integrationType, integrationRecords.recordId],
        set: {
          attemptCount: sql`${integrationRecords.attemptCount} + excluded.attempt_count`,
          firstSeenAt: sql`LEAST(${integrationRecords.firstSeenAt}, excluded.first_seen_at)`,
          timestamp: sql`GREATEST(${integrationRecords.timestamp}, excluded.timestamp)`,
          status: latest('status'),
          businessUnit: latest('business_unit'),
          system: latest('system'),
          direction: latest('direction'),
          response: latest('response'),
          workflow: latest('workflow'),
          orderReference: latest('order_reference'),
          responseCode: latest('response_code'),
          responseDescription: latest('response_description'),
          requestPayload: latest('request_payload'),
          responsePayload: latest('response_payload'),
          payloadStoredAt: latest('payload_stored_at'),
        },
      });
  }
  return { upserted: rows.length, unknownAccounts };
}

// Clear payloads stored more than PAYLOAD_CLEAR_AFTER_HOURS ago. The record row
// (status, code, description, attempt count) is kept; only the payloads go.
export async function purgeExpiredPayloads(): Promise<number> {
  const hours = PAYLOAD_CLEAR_AFTER_HOURS > 0 ? PAYLOAD_CLEAR_AFTER_HOURS : 24;
  const cleared = await db
    .update(integrationRecords)
    .set({ requestPayload: null, responsePayload: null, payloadStoredAt: null })
    .where(
      sql`${integrationRecords.payloadStoredAt} is not null and ${integrationRecords.payloadStoredAt} < (now() at time zone 'utc') - make_interval(hours => ${hours})`,
    )
    .returning({ id: integrationRecords.id });
  return cleared.length;
}

// Purge at most once every few minutes per server instance, so ingest calls
// keep storage tidy without a separate scheduler (the purge script still works).
let lastPurge = 0;
export async function purgeIfDue(minIntervalMs = 10 * 60_000): Promise<number | null> {
  const now = Date.now();
  if (now - lastPurge < minIntervalMs) return null;
  lastPurge = now;
  return purgeExpiredPayloads();
}
