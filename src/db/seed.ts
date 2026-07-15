import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from './index';
import { users, accounts, userAccounts, integrationRecords } from './schema';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('Seeding database...');

  // --- Accounts (customers) ---
  const accountNames = ['Aarke USA (Amazon)', 'Aarke USA (Ecom)'];
  const accountIds: Record<string, number> = {};
  for (const name of accountNames) {
    const existing = await db.select().from(accounts).where(eq(accounts.name, name));
    if (existing.length) {
      accountIds[name] = existing[0].id;
    } else {
      const [row] = await db.insert(accounts).values({ name }).returning();
      accountIds[name] = row.id;
    }
  }
  console.log('Accounts ready:', accountIds);

  // --- Admin user ---
  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'change-me-on-first-login';
  const existingAdmin = await db.select().from(users).where(eq(users.username, adminUsername));
  let adminId: number;
  if (existingAdmin.length) {
    adminId = existingAdmin[0].id;
    console.log(`Admin "${adminUsername}" already exists.`);
  } else {
    const hash = await bcrypt.hash(adminPassword, 10);
    const [row] = await db
      .insert(users)
      .values({ username: adminUsername, passwordHash: hash, role: 'admin' })
      .returning();
    adminId = row.id;
    console.log(`Created admin "${adminUsername}". CHANGE THIS PASSWORD after first login.`);
  }

  // Give admin access to all accounts
  for (const id of Object.values(accountIds)) {
    await db
      .insert(userAccounts)
      .values({ userId: adminId, accountId: id })
      .onConflictDoNothing();
  }

  // --- Sample integration records (stand-in for the external job) ---
  const existingRecords = await db.select().from(integrationRecords).limit(1);
  if (existingRecords.length === 0) {
    const amazon = accountIds['Aarke USA (Amazon)'];
    const rows: (typeof integrationRecords.$inferInsert)[] = [];
    const base = new Date('2026-07-13T09:00:00Z');

    // Inventory Update successes
    for (const rid of ['A1044', 'A1085', 'A1086', 'A1087', 'A1130-999-OS']) {
      rows.push({
        timestamp: new Date(base.getTime() + 8 * 60000),
        businessUnit: 'Bergen Logistics',
        system: 'CloudX WMS',
        accountId: amazon,
        direction: 'In',
        integrationType: 'Inventory Update',
        recordId: rid,
        status: 'Success',
        response: 'True',
      });
    }
    // Sales Order Fulfilment failures
    for (const rid of ['8076468355385', '8105818685753']) {
      rows.push({
        timestamp: new Date(base.getTime() + 11 * 60000),
        businessUnit: 'Bergen Logistics',
        system: 'CloudX WMS',
        accountId: amazon,
        direction: 'Out',
        integrationType: 'Sales Order Fulfilment',
        recordId: rid,
        status: 'Failed',
        response:
          '{"userErrors":[{"message":"Invalid fulfillment order line item quantity requested."}]}',
      });
    }
    await db.insert(integrationRecords).values(rows);
    console.log(`Inserted ${rows.length} sample integration records.`);
  } else {
    console.log('Integration records already present, skipping sample data.');
  }

  console.log('Seed complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
