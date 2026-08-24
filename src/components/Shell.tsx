'use client';

import { useEffect, useState } from 'react';
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

type Theme = 'retro' | 'modern';
const THEME_KEY = 'id_theme';

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
  const [theme, setTheme] = useState<Theme>('retro');

  // The inline script in layout.tsx has already applied the saved theme to
  // <html> before paint; this just syncs React state to it.
  useEffect(() => {
    const current =
      document.documentElement.dataset.theme === 'modern' ? 'modern' : 'retro';
    setTheme(current);
  }, []);

  function applyTheme(next: Theme) {
    setTheme(next);
    if (next === 'modern') {
      document.documentElement.dataset.theme = 'modern';
    } else {
      delete document.documentElement.dataset.theme;
    }
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be unavailable (private mode, blocked cookies) — the theme
      // still applies for this session, it just won't be remembered.
    }
  }

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
          <div className="sidebar-brand">
            <div className="brand-name">CLOUDX SYSTEMS</div>
            <div className="brand-sub">INTEGRATION MONITORING</div>
          </div>
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
                <button
                  className={`seg${theme === 'retro' ? ' active' : ''}`}
                  onClick={() => applyTheme('retro')}
                  aria-pressed={theme === 'retro'}
                >
                  RETRO
                </button>
                <button
                  className={`seg${theme === 'modern' ? ' active' : ''}`}
                  onClick={() => applyTheme('modern')}
                  aria-pressed={theme === 'modern'}
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
