import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
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
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }
  await createSession({ sub: String(user.id), username: user.username, role: user.role });
  return NextResponse.json({ ok: true });
}
