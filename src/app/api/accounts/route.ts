import { NextResponse } from 'next/server';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await db.select().from(accounts).orderBy(accounts.name);
  return NextResponse.json(rows);
}
