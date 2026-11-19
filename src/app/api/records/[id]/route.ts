// GET /api/records/:id — full detail (incl. payloads) for one record, loaded
// on demand so the log list never pulls payloads. Account-scoped like the pages.
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { integrationRecords, userAccounts } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { PAYLOAD_CLEAR_AFTER_HOURS } from '@/lib/records';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  const [rec] = await db.select().from(integrationRecords).where(eq(integrationRecords.id, id));
  if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (session.role !== 'admin') {
    if (rec.accountId == null) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const [allowed] = await db
      .select({ a: userAccounts.accountId })
      .from(userAccounts)
      .where(and(eq(userAccounts.userId, Number(session.sub)), eq(userAccounts.accountId, rec.accountId)));
    if (!allowed) return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: rec.id,
    workflow: rec.workflow,
    orderReference: rec.orderReference,
    recordId: rec.recordId,
    status: rec.status,
    responseCode: rec.responseCode,
    responseDescription: rec.responseDescription ?? rec.response,
    attemptCount: rec.attemptCount,
    firstSeenAt: rec.firstSeenAt,
    lastSeenAt: rec.timestamp,
    payloadStoredAt: rec.payloadStoredAt,
    retentionHours: PAYLOAD_CLEAR_AFTER_HOURS,
    requestPayload: rec.requestPayload,
    responsePayload: rec.responsePayload,
  });
}
