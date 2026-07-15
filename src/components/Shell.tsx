'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { href: '/overview', label: 'ACCOUNT OVERVIEW', adminOnly: false },
  { href: '/integration-log', label: 'INTEGRATION LOG', adminOnly: false },
  { href: '/users', label: 'USERS', adminOnly: true },
];

const SYS_LABEL: Record<string, string> = {
  '/overview': 'SYS://ACCOUNT-OVERVIEW',
  '/integration-log': 'SYS://INTEGRATION-LOG',
  '/users': 'SYS://USER-MANAGEMENT',
};

const LINE = '═'.repeat(120);

export default function Shell({
  role,
  username,
  children,
}: {
  role: string;
  username: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const sys = SYS_LABEL[pathname] ?? 'SYS://DASHBOARD';

  return (
    <div className="crt-box">
      <div className="dashboard">
        <div className="scanlines" />

        <nav className="sidebar">
          <div className="sidebar-label">MAIN MENU</div>
          {NAV.filter((n) => !n.adminOnly || role === 'admin').map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`nav-item${active ? ' active' : ''}`}
              >
                {active ? '> ' : ''}
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="main">
          <div className="topbar">
            <span>{sys}</span>
            <div className="topbar-right">
              <span style={{ color: 'var(--text-muted)' }}>{username.toUpperCase()}</span>
              <span style={{ color: 'var(--green)' }}>● ONLINE</span>
              <div className="theme-toggle">
                <button className="seg active">RETRO</button>
                <button
                  className="seg"
                  title="Modern theme coming soon"
                  onClick={() => alert('Modern theme coming soon.')}
                >
                  MODERN
                </button>
              </div>
              <button className="logout-btn" onClick={logout}>
                LOGOUT
              </button>
            </div>
          </div>
          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}

export { LINE };
