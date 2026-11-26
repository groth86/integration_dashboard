import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Not exported: Next.js route modules may only export recognised handlers
// and route config.
const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /api/account/password — change your own password.
 *
 * Unlike the admin route (PATCH /api/users/:id), this requires the current
 * password. Without that check, anyone who found an unattended logged-in
 * session could lock the real user out of their own account.
 *
 * The user is always taken from the session, never from the request body, so
 * this endpoint cannot be pointed at somebody else's account.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'Current and new password are both required' },
      { status: 400 },
    );
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: 'New password must be different from the current one' },
      { status: 400 },
    );
  }

  const [user] = await db.select().from(users).where(eq(users.id, Number(session.sub)));
  if (!user) {
    // Session points at a deleted account.
    return NextResponse.json({ error: 'Account no longer exists' }, { status: 401 });
  }

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
