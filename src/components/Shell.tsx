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

  // --- Change your own password -------------------------------------------
  // Lives in the shell rather than the Users page because /users is admin-only;
  // a regular user has no other route to it.
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean }>({ text: '', ok: true });

  function togglePw() {
    setPwOpen((o) => !o);
    setPwCurrent('');
    setPwNew('');
    setPwConfirm('');
    setPwMsg({ text: '', ok: true });
  }

  async function changeOwnPassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwNew.length < 8) {
      setPwMsg({ text: 'New password must be at least 8 characters.', ok: false });
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwMsg({ text: 'New passwords do not match.', ok: false });
      return;
    }
    setPwSaving(true);
    setPwMsg({ text: '', ok: true });
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPwMsg({ text: 'Password changed.', ok: true });
        setPwCurrent('');
        setPwNew('');
        setPwConfirm('');
      } else {
        setPwMsg({ text: data.error || 'Could not change password', ok: false });
      }
    } catch {
      setPwMsg({ text: 'Network error', ok: false });
    } finally {
      setPwSaving(false);
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
            {/* Served from public/. Plain <img> rather than next/image: the
                asset is an SVG, so there is nothing to optimise. */}
            <img
              className="brand-logo"
              src="/cloudx-logo.svg"
              alt="CloudX Systems"
              width={280}
              height={108}
            />
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
              <button
                className="logout-btn"
                onClick={togglePw}
                title="Change your own password"
                aria-expanded={pwOpen}
              >
                {pwOpen ? 'CLOSE' : 'PASSWORD'}
              </button>
              <button className="logout-btn" onClick={logout}>
                LOGOUT
              </button>
            </div>
          </div>
          {pwOpen && (
            <div className="pw-panel">
              <form onSubmit={changeOwnPassword}>
                <div className="filter-label" style={{ marginBottom: 8 }}>
                  &gt; CHANGE MY PASSWORD ({username.toUpperCase()})
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="filter-group">
                    <div className="filter-label">&gt; CURRENT</div>
                    <input
                      className="filter-field"
                      type="password"
                      autoComplete="current-password"
                      value={pwCurrent}
                      onChange={(e) => setPwCurrent(e.target.value)}
                      style={{ minWidth: 160 }}
                    />
                  </div>
                  <div className="filter-group">
                    <div className="filter-label">&gt; NEW</div>
                    <input
                      className="filter-field"
                      type="password"
                      autoComplete="new-password"
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      style={{ minWidth: 160 }}
                    />
                  </div>
                  <div className="filter-group">
                    <div className="filter-label">&gt; CONFIRM</div>
                    <input
                      className="filter-field"
                      type="password"
                      autoComplete="new-password"
                      value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                      style={{ minWidth: 160 }}
                    />
                  </div>
                  <button className="submit-btn" type="submit" disabled={pwSaving}>
                    {pwSaving ? '[ SAVING... ]' : '[ CHANGE PASSWORD ]'}
                  </button>
                  <button className="submit-btn" type="button" onClick={togglePw}>
                    [ CANCEL ]
                  </button>
                </div>
                <div className={`form-msg ${pwMsg.ok ? 'ok' : 'err'}`}>{pwMsg.text}</div>
                <div className="notes">Minimum 8 characters. You stay signed in on this device.</div>
              </form>
            </div>
          )}

          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}

export { LINE };
