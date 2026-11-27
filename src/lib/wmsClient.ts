import 'server-only';
import { decryptSecret } from '@/lib/secrets';
import type { AccountWmsConfig } from '@/db/schema';

/**
 * Minimal CloudX (WMS) client.
 *
 * The exact API contract is not settled yet, so everything that varies —
 * token endpoint, status URL, where the status sits in the response, and the
 * text that means "needs attention" — is per-account configuration rather than
 * code. Wiring CloudX up later is filling in those fields, not editing this
 * file.
 */

export type WmsCheckOutcome =
  | { ok: true; status: string | null; isError: boolean }
  | { ok: false; error: string };

type TokenCacheEntry = { token: string; expiresAt: number };

// Tokens are reused across records in a sweep. Process-local by design: a
// serverless instance holding a short-lived token in memory is fine, and the
// cache simply misses on a cold start.
const tokenCache = new Map<number, TokenCacheEntry>();

const TOKEN_SAFETY_MS = 30_000; // refresh early rather than race the expiry

export class WmsConfigError extends Error {}

function requireField(value: string | null | undefined, field: string): string {
  if (!value || !value.trim()) {
    throw new WmsConfigError(`CloudX ${field} is not configured for this account`);
  }
  return value.trim();
}

/** Follow a dot-path into a parsed JSON body. */
export function dig(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
    obj,
  );
}

async function getAccessToken(cfg: AccountWmsConfig, signal?: AbortSignal): Promise<string> {
  const cached = tokenCache.get(cfg.accountId);
  if (cached && cached.expiresAt > Date.now() + TOKEN_SAFETY_MS) return cached.token;

  const tokenUrl = requireField(cfg.tokenUrl, 'token URL');
  const clientId = requireField(cfg.clientId, 'client ID');
  const sealed = requireField(cfg.clientSecret, 'client secret');
  const clientSecret = decryptSecret(sealed);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (cfg.scope) body.set('scope', cfg.scope);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Never echo the response wholesale — it can contain the credentials back.
    throw new Error(`Token request failed (${res.status} ${res.statusText})${text ? ': ' + text.slice(0, 120) : ''}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('Token response did not include access_token');

  const ttlMs = (typeof json.expires_in === 'number' ? json.expires_in : 300) * 1000;
  tokenCache.set(cfg.accountId, { token: json.access_token, expiresAt: Date.now() + ttlMs });
  return json.access_token;
}

/** Drop a cached token, e.g. after a 401, so the next call re-authenticates. */
export function invalidateToken(accountId: number): void {
  tokenCache.delete(accountId);
}

/**
 * Ask CloudX for one record's status.
 *
 * Returns the raw status text plus whether it matches the account's configured
 * "needs attention" value. Deciding what to do with that belongs to the caller.
 */
export async function checkRecordStatus(
  cfg: AccountWmsConfig,
  orderReference: string,
  opts: { timeoutMs?: number } = {},
): Promise<WmsCheckOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  try {
    const template = requireField(cfg.statusUrlTemplate, 'status URL');
    if (!template.includes('{orderReference}')) {
      throw new WmsConfigError('Status URL must contain {orderReference}');
    }
    const url = template.replace('{orderReference}', encodeURIComponent(orderReference));

    const attempt = async (token: string) =>
      fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      });

    let token = await getAccessToken(cfg, controller.signal);
    let res = await attempt(token);

    // A cached token can expire mid-sweep; retry once with a fresh one.
    if (res.status === 401) {
      invalidateToken(cfg.accountId);
      token = await getAccessToken(cfg, controller.signal);
      res = await attempt(token);
    }

    if (res.status === 404) {
      // Not found in the WMS yet. Not an error state — just nothing to say.
      return { ok: true, status: null, isError: false };
    }
    if (!res.ok) {
      return { ok: false, error: `Status request failed (${res.status} ${res.statusText})` };
    }

    const payload: unknown = await res.json();
    const raw = dig(payload, cfg.statusPath ?? '');
    const status = raw === null || raw === undefined ? null : String(raw);

    const target = cfg.errorStatusValue.trim().toLowerCase();
    const isError = !!status && status.trim().toLowerCase() === target;

    return { ok: true, status, isError };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg === 'The operation was aborted.' ? 'Request timed out' : msg };
  } finally {
    clearTimeout(timeout);
  }
}
