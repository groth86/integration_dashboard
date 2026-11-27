import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, accountWmsConfig } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { encryptSecret, secretsKeyAvailable } from '@/lib/secrets';
import { sweepAccount } from '@/lib/wmsSweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getSession();
  return session && session.role === 'admin' ? session : null;
}

/**
 * GET — current CloudX settings for an account.
 *
 * The client secret is never returned, only whether one is stored. There is no
 * legitimate reason for the browser to see it, and plenty of ways for it to
 * leak once it is there.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const accountId = Number((await params).id);
  if (!Number.isInteger(accountId)) {
    return NextResponse.json({ error: 'Invalid account id' }, { status: 400 });
  }

  const [cfg] = await db
    .select()
    .from(accountWmsConfig)
    .where(eq(accountWmsConfig.accountId, accountId));

  return NextResponse.json({
    accountId,
    enabled: cfg?.enabled ?? false,
    tokenUrl: cfg?.tokenUrl ?? '',
    clientId: cfg?.clientId ?? '',
    hasClientSecret: Boolean(cfg?.clientSecret),
    scope: cfg?.scope ?? '',
    statusUrlTemplate: cfg?.statusUrlTemplate ?? '',
    statusPath: cfg?.statusPath ?? '',
    errorStatusValue: cfg?.errorStatusValue ?? 'Imported with Errors',
    checkTypes: cfg?.checkTypes ?? 'Pick Ticket',
    lastCheckedAt: cfg?.lastCheckedAt ?? null,
    lastError: cfg?.lastError ?? null,
    encryptionReady: secretsKeyAvailable(),
  });
}

/** PUT — save settings. Omit clientSecret to keep the stored one. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const accountId = Number((await params).id);
  if (!Number.isInteger(accountId)) {
    return NextResponse.json({ error: 'Invalid account id' }, { status: 400 });
  }
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const enabled = body.enabled === true;
  const tokenUrl = str(body.tokenUrl);
  const clientId = str(body.clientId);
  const scope = str(body.scope);
  const statusUrlTemplate = str(body.statusUrlTemplate);
  const statusPath = str(body.statusPath);
  const errorStatusValue = str(body.errorStatusValue) || 'Imported with Errors';
  const checkTypes = str(body.checkTypes) || 'Pick Ticket';
  const newSecret = typeof body.clientSecret === 'string' ? body.clientSecret : '';

  const [existing] = await db
    .select()
    .from(accountWmsConfig)
    .where(eq(accountWmsConfig.accountId, accountId));

  // Only validate hard when switching it on — half-filled settings can be saved
  // as a draft while details are still being chased from CloudX.
  if (enabled) {
    const missing: string[] = [];
    if (!tokenUrl) missing.push('token URL');
    if (!clientId) missing.push('client ID');
    if (!newSecret && !existing?.clientSecret) missing.push('client secret');
    if (!statusUrlTemplate) missing.push('status URL');
    if (missing.length) {
      return NextResponse.json(
        { error: `Cannot enable checking — missing: ${missing.join(', ')}` },
        { status: 400 },
      );
    }
    if (!statusUrlTemplate.includes('{orderReference}')) {
      return NextResponse.json(
        { error: 'Status URL must include {orderReference}' },
        { status: 400 },
      );
    }
  }

  let sealed = existing?.clientSecret ?? null;
  if (newSecret) {
    if (!secretsKeyAvailable()) {
      return NextResponse.json(
        { error: 'CREDENTIALS_KEY is not configured on the server, so secrets cannot be stored' },
        { status: 503 },
      );
    }
    sealed = encryptSecret(newSecret);
  }

  const values = {
    accountId,
    enabled,
    tokenUrl: tokenUrl || null,
    clientId: clientId || null,
    clientSecret: sealed,
    scope: scope || null,
    statusUrlTemplate: statusUrlTemplate || null,
    statusPath: statusPath || null,
    errorStatusValue,
    checkTypes,
    updatedAt: new Date(),
  };

  await db
    .insert(accountWmsConfig)
    .values(values)
    .onConflictDoUpdate({ target: accountWmsConfig.accountId, set: values });

  return NextResponse.json({ ok: true, hasClientSecret: Boolean(sealed) });
}

/** POST — run a check for this account now (also acts as a connection test). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const accountId = Number((await params).id);
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const result = await sweepAccount({ id: account.id, name: account.name }, { limit: 50 });
  return NextResponse.json(result);
}
