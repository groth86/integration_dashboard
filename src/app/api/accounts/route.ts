import { NextResponse } from 'next/server';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME = 120;

function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
}

/**
 * GET /api/accounts
 *   default      — active accounts only, for dropdowns and filters
 *   ?manage=1    — admin only: every account, with usage counts, for the
 *                  Account Management screen
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const manage = new URL(req.url).searchParams.get('manage') === '1';

  if (!manage) {
    const rows = await db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.isActive, true))
      .orderBy(asc(accounts.name));
    return NextResponse.json(rows);
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Counts make the consequences of deactivating visible before you do it.
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      isActive: accounts.isActive,
      createdAt: accounts.createdAt,
      // Written as literal SQL rather than interpolating drizzle columns:
      // interpolation renders these unqualified ("account_id" = "id"), which
      // resolves both names against the inner table and silently counts zero.
      recordCount: sql<number>`(
        select count(*)::int from integration_records
        where integration_records.account_id = accounts.id
      )`,
      userCount: sql<number>`(
        select count(*)::int from user_accounts
        where user_accounts.account_id = accounts.id
      )`,
      lastRecordAt: sql<string | null>`(
        select max(integration_records."timestamp") from integration_records
        where integration_records.account_id = accounts.id
      )`,
    })
    .from(accounts)
    .orderBy(asc(accounts.name));

  return NextResponse.json(rows);
}

/** POST /api/accounts — create an account (admin only). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: 'Account name is required' }, { status: 400 });
  if (name.length > MAX_NAME) {
    return NextResponse.json({ error: `Name must be ${MAX_NAME} characters or fewer` }, { status: 400 });
  }

  // Names are unique. A clash is usually a deactivated account the admin has
  // forgotten about, so say so rather than returning a bare conflict.
  const [existing] = await db.select().from(accounts).where(eq(accounts.name, name));
  if (existing) {
    return NextResponse.json(
      {
        error: existing.isActive
          ? `"${name}" already exists.`
          : `"${name}" already exists but is inactive — reactivate it instead.`,
      },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(accounts)
    .values({ name })
    .returning({ id: accounts.id, name: accounts.name, isActive: accounts.isActive });

  return NextResponse.json(created, { status: 201 });
}
