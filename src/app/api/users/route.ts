import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { users, userAccounts, accounts } from '@/db/schema';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'admin') return null;
  return session;
}

// GET /api/users — list all users with their assigned account ids + names
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.username);

  const assignments = await db
    .select({
      userId: userAccounts.userId,
      accountId: accounts.id,
      accountName: accounts.name,
    })
    .from(userAccounts)
    .innerJoin(accounts, eq(userAccounts.accountId, accounts.id));

  const result = allUsers.map((u) => ({
    ...u,
    accounts: assignments
      .filter((a) => a.userId === u.id)
      .map((a) => ({ id: a.accountId, name: a.accountName })),
  }));

  return NextResponse.json(result);
}

// POST /api/users — create a user and assign accounts
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { username, password, role, accountIds } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const existing = await db.select().from(users).where(eq(users.username, username));
  if (existing.length) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [created] = await db
    .insert(users)
    .values({ username, passwordHash, role: role === 'admin' ? 'admin' : 'user' })
    .returning({ id: users.id, username: users.username, role: users.role });

  const ids: number[] = Array.isArray(accountIds) ? accountIds : [];
  if (ids.length) {
    // Only assign accounts that actually exist
    const valid = await db.select({ id: accounts.id }).from(accounts).where(inArray(accounts.id, ids));
    const validIds = valid.map((v) => v.id);
    if (validIds.length) {
      await db
        .insert(userAccounts)
        .values(validIds.map((accountId) => ({ userId: created.id, accountId })))
        .onConflictDoNothing();
    }
  }

  return NextResponse.json({ ...created, accountIds: ids }, { status: 201 });
}
