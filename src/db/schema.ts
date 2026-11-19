import {
  pgTable,
  serial,
  text,
  timestamp,
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
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Customer accounts (e.g. "Aarke USA (Amazon)")
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
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

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type IntegrationRecord = typeof integrationRecords.$inferSelect;
