import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';

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

// Integration event records.
// NOTE: This table is populated by an external scheduled job.
// The application only reads from it.
export const integrationRecords = pgTable('integration_records', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp').notNull(),
  businessUnit: text('business_unit'),
  system: text('system'),
  accountId: integer('account_id').references(() => accounts.id),
  direction: text('direction'), // 'In' | 'Out'
  integrationType: text('integration_type').notNull(),
  recordId: text('record_id'),
  status: text('status').notNull(), // 'Success' | 'Failed'
  response: text('response'),
});

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type IntegrationRecord = typeof integrationRecords.$inferSelect;
