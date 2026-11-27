import { NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME = 120;

/**
 * PATCH /api/accounts/:id — rename and/or activate/deactivate (admin only).
 *
 * There is no DELETE. Integration records reference accounts, so removing one
 * would either orphan or cascade away history; deactivating hides it with no
 * data loss and is reversible.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const accountId = Number(id);
  if (!Number.isInteger(accountId)) {
    return NextResponse.json({ error: 'Invalid account id' }, { status: 400 });
  }

  let body: { name?: unknown; isActive?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const [target] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!target) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const update: { name?: string; isActive?: boolean } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!name) return NextResponse.json({ error: 'Account name cannot be empty' }, { status: 400 });
    if (name.length > MAX_NAME) {
      return NextResponse.json({ error: `Name must be ${MAX_NAME} characters or fewer` }, { status: 400 });
    }
    const [clash] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.name, name), ne(accounts.id, accountId)));
    if (clash) {
      return NextResponse.json({ error: `Another account is already called "${name}".` }, { status: 409 });
    }
    update.name = name;
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive must be true or false' }, { status: 400 });
    }
    update.isActive = body.isActive;
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const [updated] = await db
    .update(accounts)
    .set(update)
    .where(eq(accounts.id, accountId))
    .returning({ id: accounts.id, name: accounts.name, isActive: accounts.isActive });

  return NextResponse.json(updated);
}
