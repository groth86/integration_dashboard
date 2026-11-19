// POST /api/recordimport/fromflowgear — receives record outcomes from Flowgear (or any caller).
//
// Auth:  Authorization: Bearer <FLOWGEAR_IMPORT_BEARER_TOKEN>
// Body:  one record object, an array of them, or { "records": [...] }
//        (max FLOWGEAR_IMPORT_MAX_RECORDS_PER_REQUEST per call, default 500). Fields: see
//        IncomingRecord in src/lib/records.ts.
//
// Each record is upserted as the LATEST outcome for its
// (accountName, integrationType, recordId); repeats increase attemptCount.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { normaliseRecord, upsertRecords, purgeIfDue, type IncomingRecord, type NormalisedRecord } from '@/lib/records';

export const dynamic = 'force-dynamic';

const MAX_BATCH = Number(process.env.FLOWGEAR_IMPORT_MAX_RECORDS_PER_REQUEST || '500');
const CREATE_ACCOUNTS = !['0', 'false', 'no'].includes(
  (process.env.FLOWGEAR_IMPORT_AUTO_CREATE_ACCOUNTS || 'true').toLowerCase(),
);

function authorised(req: Request): boolean {
  const expected = process.env.FLOWGEAR_IMPORT_BEARER_TOKEN;
  if (!expected) return false; // endpoint disabled until a token is configured
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }

  const list: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as any).records)
      ? (body as any).records
      : [body];

  if (list.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `too many records (${list.length}); max ${MAX_BATCH} per call` },
      { status: 413 },
    );
  }

  const valid: NormalisedRecord[] = [];
  const skipped: { index: number; recordId?: unknown; reason: string }[] = [];
  list.forEach((item, index) => {
    const r = normaliseRecord(item as IncomingRecord);
    if (typeof r === 'string') {
      skipped.push({ index, recordId: (item as any)?.recordId ?? (item as any)?.orderReference, reason: r });
    } else {
      valid.push(r);
    }
  });

  try {
    const { upserted, unknownAccounts } = await upsertRecords(valid, { createAccounts: CREATE_ACCOUNTS });
    for (const name of unknownAccounts) {
      skipped.push({ index: -1, reason: `unknown account "${name}" (FLOWGEAR_IMPORT_AUTO_CREATE_ACCOUNTS=false)` });
    }
    // Opportunistic payload purge (throttled); failures must not fail the ingest.
    await purgeIfDue().catch((e) => console.error('[recordimport] purge failed:', e));
    return NextResponse.json({ received: list.length, upserted, skipped });
  } catch (e) {
    console.error('[recordimport] failed:', e);
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
