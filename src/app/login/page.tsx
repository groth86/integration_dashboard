'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push('/overview');
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="crt-box" style={{ maxWidth: 380 }}>
        <div className="login-box">
          <div className="scanlines" />
          <div className="login-inner">
            <div className="login-title">
              INTEGRATION DASHBOARD<span className="crt-cursor" style={{ color: 'var(--green)' }}>_</span>
            </div>
            <div className="login-sub">SYS://AUTH — SIGN IN</div>
            <form onSubmit={handleSubmit}>
              <div className="login-field">
                <div className="filter-label">&gt; USERNAME</div>
                <input
                  className="filter-field"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="login-field">
                <div className="filter-label">&gt; PASSWORD</div>
                <input
                  className="filter-field"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="login-error">{error}</div>
              <button className="submit-btn" type="submit" disabled={loading} style={{ width: '100%' }}>
                {loading ? '[ AUTHENTICATING... ]' : '[ SIGN IN ]'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
