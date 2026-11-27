import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { createSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
  }
  const [user] = await db.select().from(users).where(eq(users.username, username));

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    // Count the failed attempt against the account, when there is one. An
    // unknown username has no row to record against; it is deliberately not
    // created, since that would let anyone fill the table with junk.
    if (user) {
      await db
        .update(users)
        .set({
          failedLoginCount: sql`${users.failedLoginCount} + 1`,
          lastFailedLoginAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }
    // Same response either way, so this never reveals whether a username exists.
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const now = new Date();
  await db
    .update(users)
    .set({ lastLoginAt: now, lastSeenAt: now, failedLoginCount: 0 })
    .where(eq(users.id, user.id));

  await createSession({ sub: String(user.id), username: user.username, role: user.role,
    tokenVersion: user.tokenVersion,
  });
  return NextResponse.json({ ok: true });
}
