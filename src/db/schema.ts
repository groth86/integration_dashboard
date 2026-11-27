import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Application users who can log in
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  // Bumped on every password change; session JWTs carry the value they were
  // issued with, so bumping it signs the user out everywhere else.
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // --- login tracking ---
  // These are `timestamptz`, unlike the older columns above. A bare `timestamp`
  // is returned without a zone and the driver reads it as server-local time, so
  // on a non-UTC host it lands an hour (or more) off — which silently broke the
  // staleness comparison below. Storing an absolute instant removes the
  // ambiguity for both the server and the browser.
  // Set on each successful sign-in.
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  // Refreshed as the user moves around, throttled to roughly once every few
  // minutes. Used to approximate "online now" — JWT sessions are stateless, so
  // there is no sign-out event to observe.
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  // Consecutive failed sign-ins; reset to 0 on a successful one.
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lastFailedLoginAt: timestamp('last_failed_login_at', { withTimezone: true }),
});

// Customer accounts (e.g. "Aarke USA (Amazon)")
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  // Inactive accounts are hidden from every screen, dropdown and export except
  // the Account Management page. Nothing is deleted — reactivating brings the
  // account and all its history straight back.
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Which accounts each user is allowed to see (many-to-many)
export const userAccounts = pgTable(
  'user_accounts',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.accountId] }),
  }),
);

// Integration records: ONE row per record (account + integration type +
// record id), holding only its LATEST outcome. Each new outcome for the same
// record overwrites the row and increments attempt_count, so the table grows
// with the number of distinct records, not with the number of attempts.
//
// Written by POST /api/recordimport/fromflowgear (and the optional pull job in src/jobs).
// Payload columns are cleared PAYLOAD_CLEAR_AFTER_HOURS (default 24) after they
// were stored — see src/lib/records.ts purgeExpiredPayloads().
export const integrationRecords = pgTable(
  'integration_records',
  {
    id: serial('id').primaryKey(),
    // Time of the latest outcome
    timestamp: timestamp('timestamp').notNull(),
    businessUnit: text('business_unit'),
    system: text('system'),
    accountId: integer('account_id').references(() => accounts.id),
    direction: text('direction'), // 'In' | 'Out'
    integrationType: text('integration_type').notNull(),
    // Unique key of the record within account + integration type
    // (e.g. the Flowgear Key-Value key)
    recordId: text('record_id'),
    status: text('status').notNull(), // 'Success' | 'Failed'
    response: text('response'), // legacy short response text
    // --- latest-outcome fields ---
    workflow: text('workflow'),
    orderReference: text('order_reference'),
    responseCode: integer('response_code'),
    responseDescription: text('response_description'),
    requestPayload: text('request_payload'),
    responsePayload: text('response_payload'),
    // When the payloads were stored; null once purged or when none were sent
    payloadStoredAt: timestamp('payload_stored_at'),
    attemptCount: integer('attempt_count').notNull().default(1),
    firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
  },
  (t) => ({
    recordKey: uniqueIndex('integration_records_record_key').on(
      t.accountId,
      t.integrationType,
      t.recordId,
    ),
    byTimestamp: index('integration_records_timestamp_idx').on(t.timestamp),
    byOrderRef: index('integration_records_order_ref_idx').on(t.orderReference),
    // Partial index: only rows still holding a payload, so the purge
    // query stays cheap however large the table gets.
    payloadExpiry: index('integration_records_payload_expiry_idx')
      .on(t.payloadStoredAt)
      .where(sql`${t.payloadStoredAt} is not null`),
  }),
);

/**
 * Per-account CloudX (WMS) connection settings.
 *
 * Kept in its own table rather than on `accounts` so that a plain
 * `select * from accounts` can never return a credential, and so this table can
 * be treated differently in backups and access reviews.
 *
 * The client secret is stored encrypted (see src/lib/secrets.ts) and is never
 * sent to the browser — the UI only ever learns whether one is set.
 */
export const accountWmsConfig = pgTable('account_wms_config', {
  accountId: integer('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  // OAuth client-credentials flow
  tokenUrl: text('token_url'),
  clientId: text('client_id'),
  clientSecret: text('client_secret'), // AES-256-GCM sealed
  scope: text('scope'),
  // Where to ask for a record's status. {orderReference} is substituted.
  statusUrlTemplate: text('status_url_template'),
  // Dot-path to the status value inside the JSON response, e.g. "data.status".
  statusPath: text('status_path'),
  // The exact status text that means "needs attention".
  errorStatusValue: text('error_status_value').notNull().default('Imported with Errors'),
  // Comma-separated integration types to check. Pick Tickets today; ASNs later
  // are a config change rather than a code change.
  checkTypes: text('check_types').notNull().default('Pick Ticket'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AccountWmsConfig = typeof accountWmsConfig.$inferSelect;

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type IntegrationRecord = typeof integrationRecords.$inferSelect;
