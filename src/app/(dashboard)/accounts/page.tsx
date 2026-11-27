import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AccountsManager from './AccountsManager';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/overview');
  return <AccountsManager />;
}
