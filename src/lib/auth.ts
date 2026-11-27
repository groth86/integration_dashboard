import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';

const COOKIE_NAME = 'id_session';
const alg = 'HS256';

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string; // user id
  username: string;
  role: string;
  tokenVersion: number; // users.token_version at issue time
};

// How stale last_seen_at may get before it is refreshed. Keeps "online now"
// useful without writing to the database on every single request.
const SEEN_REFRESH = '5 minutes';

// Current tokenVersion for a user, or null if the user no longer exists.
// React cache() dedupes this per request, so layout + page + handler share one
// primary-key lookup instead of one each.
//
// This also refreshes last_seen_at, but only once the previous value is older
// than SEEN_REFRESH_MS. The common request therefore costs the same single
// SELECT it did before; the extra UPDATE happens at most once per user per
// refresh window.
const currentTokenVersion = cache(async (userId: number): Promise<number | null> => {
  const [row] = await db
    .select({
      tokenVersion: users.tokenVersion,
      // Staleness is evaluated by Postgres against its own clock. Comparing in
      // JavaScript instead would depend on how the driver interprets the stored
      // value, which is exactly how this silently stopped refreshing before.
      seenStale: sql<boolean>`(
        ${users.lastSeenAt} is null
        or ${users.lastSeenAt} < now() - interval '${sql.raw(SEEN_REFRESH)}'
      )`,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) return null;

  if (row.seenStale) {
    // Awaited rather than fire-and-forget: on serverless the function can be
    // frozen the moment the response is sent, which would drop the write.
    await db
      .update(users)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(users.id, userId));
  }
  return row.tokenVersion;
});

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const session = payload as unknown as SessionPayload;
    // Tokens issued before this field existed have no claim; treat as 0 so
    // they stay valid until that user's password next changes.
    const issuedVersion = typeof session.tokenVersion === 'number' ? session.tokenVersion : 0;
    const userId = Number(session.sub);
    if (!Number.isInteger(userId)) return null;
    const current = await currentTokenVersion(userId);
    // null = user deleted; mismatch = password changed since this token was issued.
    if (current === null || current !== issuedVersion) return null;
    return { ...session, tokenVersion: issuedVersion };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
