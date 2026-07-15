'use client';

import { useEffect, useState, useCallback } from 'react';

type Account = { id: number; name: string };
type UserRow = {
  id: number;
  username: string;
  role: string;
  createdAt: string;
  accounts: { id: number; name: string }[];
};

export default function UsersManager({ currentUserId }: { currentUserId: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  // create form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [selected, setSelected] = useState<number[]>([]);
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>({ text: '', ok: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [aRes, uRes] = await Promise.all([fetch('/api/accounts'), fetch('/api/users')]);
    if (aRes.ok) setAccounts(await aRes.json());
    if (uRes.ok) setUsers(await uRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg({ text: '', ok: true });
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role, accountIds: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ text: `User "${username}" created.`, ok: true });
        setUsername('');
        setPassword('');
        setRole('user');
        setSelected([]);
        await load();
      } else {
        setMsg({ text: data.error || 'Failed to create user', ok: false });
      }
    } catch {
      setMsg({ text: 'Network error', ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(id: number, name: string) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to delete user');
    }
  }

  return (
    <>
      <div className="title-banner">
        <div className="title-text">
          USER MANAGEMENT<span className="crt-cursor" style={{ color: 'var(--green)' }}>_</span>
        </div>
      </div>

      {/* Create user */}
      <div className="panel">
        <div className="panel-title">&gt; CREATE USER</div>
        <form onSubmit={createUser}>
          <div className="filters">
            <div className="filter-group">
              <div className="filter-label">&gt; USERNAME</div>
              <input className="filter-field" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="filter-group">
              <div className="filter-label">&gt; PASSWORD</div>
              <input className="filter-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="filter-group">
              <div className="filter-label">&gt; ROLE</div>
              <select className="filter-field" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>

          <div className="filter-label" style={{ marginBottom: 8 }}>&gt; ASSIGNED ACCOUNTS</div>
          <div className="checklist" style={{ marginBottom: 12 }}>
            {accounts.length === 0 && <span className="cell-empty">No accounts available.</span>}
            {accounts.map((a) => (
              <label key={a.id} className="checkline">
                <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                {a.name}
              </label>
            ))}
          </div>

          <button className="submit-btn" type="submit" disabled={saving}>
            {saving ? '[ SAVING... ]' : '[ CREATE USER ]'}
          </button>
          <div className={`form-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>
        </form>
      </div>

      {/* Existing users */}
      <div className="panel">
        <div className="panel-title">&gt; EXISTING USERS</div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <td>USERNAME</td>
                <td>ROLE</td>
                <td>ASSIGNED ACCOUNTS</td>
                <td></td>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="row-cell">{u.username}</td>
                  <td className="role-tag">{u.role}</td>
                  <td>
                    {u.accounts.length === 0 ? (
                      <span className="cell-empty">— none —</span>
                    ) : (
                      u.accounts.map((a) => (
                        <span key={a.id} className="badge">
                          {a.name}
                        </span>
                      ))
                    )}
                  </td>
                  <td>
                    {String(u.id) !== currentUserId && (
                      <button className="icon-btn" onClick={() => deleteUser(u.id, u.username)}>
                        DELETE
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="footer-bar">{'═'.repeat(120)}</div>
      <div className="ready">READY<span className="crt-cursor">_</span></div>
    </>
  );
}
