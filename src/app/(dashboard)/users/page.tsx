import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import UsersManager from './UsersManager';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/overview');
  return <UsersManager currentUserId={session.sub} />;
}
