import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import Shell from '@/components/Shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <Shell role={session.role} username={session.username}>
      {children}
    </Shell>
  );
}
