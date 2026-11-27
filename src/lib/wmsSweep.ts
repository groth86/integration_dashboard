import 'server-only';
import { and, eq, gte, inArray, isNotNull, desc } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, accountWmsConfig, integrationRecords } from '@/db/schema';
import { checkRecordStatus } from '@/lib/wmsClient';

/**
 * Re-checks records against CloudX and flags the ones stuck in
 * "Imported with Errors".
 *
 * The problem being solved: a pick ticket can be accepted by the API — so the
 * dashboard shows Success — and then fail CloudX's own validation. Operators
 * only find out by opening a specific WMS screen. This brings that state here.
 */

export const IMPORTED_WITH_ERRORS = 'Imported with Errors';
export const SUCCESS = 'Success';

/** Statuses eligible for re-checking. A record that failed at the API never
 *  reached the WMS, so there is nothing to ask about. */
const CHECKABLE = [SUCCESS, IMPORTED_WITH_ERRORS];

export type SweepResult = {
  accountId: number;
  accountName: string;
  checked: number;
  flagged: number;   // Success -> Imported with Errors
  cleared: number;   // Imported with Errors -> Success (resolved in the WMS)
  unchanged: number;
  errors: number;
  message?: string;
};

export function parseCheckTypes(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Sweep one account. Returns counts rather than throwing, so one
 * misconfigured account cannot abort the whole run.
 */
export async function sweepAccount(
  account: { id: number; name: string },
  opts: { lookbackHours?: number; limit?: number; dryRun?: boolean } = {},
): Promise<SweepResult> {
  const base: SweepResult = {
    accountId: account.id,
    accountName: account.name,
    checked: 0,
    flagged: 0,
    cleared: 0,
    unchanged: 0,
    errors: 0,
  };

  const [cfg] = await db
    .select()
    .from(accountWmsConfig)
    .where(eq(accountWmsConfig.accountId, account.id));

  if (!cfg || !cfg.enabled) return { ...base, message: 'WMS checking not enabled' };

  const types = parseCheckTypes(cfg.checkTypes);
  if (!types.length) return { ...base, message: 'No integration types configured to check' };

  const since = new Date(Date.now() - (opts.lookbackHours ?? 48) * 3_600_000);

  const candidates = await db
    .select({
      id: integrationRecords.id,
      orderReference: integrationRecords.orderReference,
      status: integrationRecords.status,
    })
    .from(integrationRecords)
    .where(
      and(
        eq(integrationRecords.accountId, account.id),
        inArray(integrationRecords.integrationType, types),
        inArray(integrationRecords.status, CHECKABLE),
        isNotNull(integrationRecords.orderReference),
        gte(integrationRecords.timestamp, since),
      ),
    )
    .orderBy(desc(integrationRecords.timestamp))
    .limit(opts.limit ?? 200);

  let lastError: string | null = null;

  for (const rec of candidates) {
    if (!rec.orderReference) continue;
    const outcome = await checkRecordStatus(cfg, rec.orderReference);
    base.checked++;

    if (!outcome.ok) {
      base.errors++;
      lastError = outcome.error;
      continue;
    }

    // The rule: only "Imported with Errors" changes anything. Every other WMS
    // status means the record is fine, so it reads as Success here — including
    // when a previously flagged record has since been resolved in the WMS.
    const desired = outcome.isError ? IMPORTED_WITH_ERRORS : SUCCESS;

    if (desired === rec.status) {
      base.unchanged++;
      continue;
    }

    if (!opts.dryRun) {
      await db
        .update(integrationRecords)
        .set({
          status: desired,
          responseDescription: outcome.isError
            ? `CloudX: ${outcome.status ?? IMPORTED_WITH_ERRORS}`
            : `CloudX: ${outcome.status ?? 'accepted'}`,
        })
        .where(eq(integrationRecords.id, rec.id));
    }

    if (desired === IMPORTED_WITH_ERRORS) base.flagged++;
    else base.cleared++;
  }

  if (!opts.dryRun) {
    await db
      .update(accountWmsConfig)
      .set({ lastCheckedAt: new Date(), lastError })
      .where(eq(accountWmsConfig.accountId, account.id));
  }

  return base;
}

/** Sweep every active account that has WMS checking switched on. */
export async function sweepAll(
  opts: { lookbackHours?: number; limit?: number; dryRun?: boolean } = {},
): Promise<SweepResult[]> {
  const rows = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .innerJoin(accountWmsConfig, eq(accountWmsConfig.accountId, accounts.id))
    .where(and(eq(accounts.isActive, true), eq(accountWmsConfig.enabled, true)))
    .orderBy(accounts.name);

  const results: SweepResult[] = [];
  for (const a of rows) results.push(await sweepAccount(a, opts));
  return results;
}
