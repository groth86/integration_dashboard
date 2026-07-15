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

// PATCH /api/users/:id — update password and/or account assignments
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const userId = Number(id);
  const { password, accountIds } = await req.json();

  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (typeof password === 'string' && password.length > 0) {
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  }

  if (Array.isArray(accountIds)) {
    // Replace assignments
    await db.delete(userAccounts).where(eq(userAccounts.userId, userId));
    if (accountIds.length) {
      const valid = await db.select({ id: accounts.id }).from(accounts).where(inArray(accounts.id, accountIds));
      const validIds = valid.map((v) => v.id);
      if (validIds.length) {
        await db.insert(userAccounts).values(validIds.map((accountId) => ({ userId, accountId })));
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/users/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const userId = Number(id);

  if (String(userId) === admin.sub) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  await db.delete(users).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
