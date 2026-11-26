import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { integrationRecords } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { buildRecordFilters, getVisibleAccounts } from '@/lib/recordFilters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exports every record matching the current filters — not just the page on
 * screen. Reuses the same filter builder as the table, so what you export is
 * exactly what you were looking at, account scoping included.
 *
 * ?format=csv (default) | tsv
 */

const COLUMNS: { header: string; get: (r: Row) => string }[] = [
  { header: 'Timestamp', get: (r) => fmt(r.timestamp) },
  { header: 'Business Unit', get: (r) => r.businessUnit ?? '' },
  { header: 'System', get: (r) => r.system ?? '' },
  { header: 'Direction', get: (r) => r.direction ?? '' },
  { header: 'Integration', get: (r) => r.integrationType ?? '' },
  { header: 'Order Ref', get: (r) => r.orderReference ?? '' },
  { header: 'Record ID', get: (r) => r.recordId ?? '' },
  { header: 'Status', get: (r) => r.status ?? '' },
  { header: 'Code', get: (r) => (r.responseCode == null ? '' : String(r.responseCode)) },
  { header: 'Retries', get: (r) => String(Math.max(0, (r.attemptCount ?? 0) - 1)) },
  { header: 'Response', get: (r) => r.responseDescription ?? r.response ?? '' },
];

type Row = {
  timestamp: Date;
  businessUnit: string | null;
  system: string | null;
  direction: string | null;
  integrationType: string;
  orderReference: string | null;
  recordId: string | null;
  status: string;
  responseCode: number | null;
  attemptCount: number;
  responseDescription: string | null;
  response: string | null;
};

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** RFC 4180 quoting. Also neutralises leading =,+,-,@ so spreadsheets don't
 *  interpret a response body as a formula. */
function csvCell(value: string, delimiter: string): string {
  let v = value.replace(/\r?\n/g, ' ');
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  if (v.includes('"') || v.includes(delimiter) || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const sp: Record<string, string | undefined> = {};
  url.searchParams.forEach((v, k) => {
    sp[k] = v;
  });

  const visibleAccounts = await getVisibleAccounts(session);
  const accountIds = visibleAccounts.map((a) => a.id);
  const { where } = buildRecordFilters(sp, accountIds);

  const rows = (await db
    .select({
      timestamp: integrationRecords.timestamp,
      businessUnit: integrationRecords.businessUnit,
      system: integrationRecords.system,
      direction: integrationRecords.direction,
      integrationType: integrationRecords.integrationType,
      orderReference: integrationRecords.orderReference,
      recordId: integrationRecords.recordId,
      status: integrationRecords.status,
      responseCode: integrationRecords.responseCode,
      attemptCount: integrationRecords.attemptCount,
      responseDescription: integrationRecords.responseDescription,
      response: integrationRecords.response,
    })
    .from(integrationRecords)
    .where(where)
    .orderBy(desc(integrationRecords.timestamp), desc(integrationRecords.id))) as Row[];

  const tsv = url.searchParams.get('format') === 'tsv';
  const delimiter = tsv ? '\t' : ',';

  const lines = [
    COLUMNS.map((c) => csvCell(c.header, delimiter)).join(delimiter),
    ...rows.map((r) => COLUMNS.map((c) => csvCell(c.get(r), delimiter)).join(delimiter)),
  ];
  // The BOM makes Excel read the file as UTF-8 rather than guessing.
  const body = (tsv ? '' : '﻿') + lines.join('\r\n');

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': tsv ? 'text/plain; charset=utf-8' : 'text/csv; charset=utf-8',
      ...(tsv
        ? {}
        : { 'Content-Disposition': `attachment; filename="integration-log-${stamp}.csv"` }),
      'Cache-Control': 'no-store',
    },
  });
}
