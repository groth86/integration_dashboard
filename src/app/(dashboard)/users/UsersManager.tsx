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

  // account-access panel state
  const [manageUserId, setManageUserId] = useState<number | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<number | null>(null);
  const [accessMsg, setAccessMsg] = useState<{ text: string; ok: boolean }>({ text: '', ok: true });

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
      if (manageUserId === id) setManageUserId(null);
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to delete user');
    }
  }

  // --- Account access -------------------------------------------------------

  const manageUser = users.find((u) => u.id === manageUserId) ?? null;
  const assignedIds = manageUser ? manageUser.accounts.map((a) => a.id) : [];
  const assigned = manageUser ? manageUser.accounts : [];
  const available = manageUser ? accounts.filter((a) => !assignedIds.includes(a.id)) : [];

  // The PATCH endpoint replaces the whole assignment set, so send the full
  // intended list rather than a delta.
  async function setAccess(nextIds: number[], accountId: number, verb: string, accountName: string) {
    if (!manageUser) return;
    setBusyAccountId(accountId);
    setAccessMsg({ text: '', ok: true });
    try {
      const res = await fetch(`/api/users/${manageUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds: nextIds }),
      });
      if (res.ok) {
        setAccessMsg({ text: `${verb} "${accountName}".`, ok: true });
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setAccessMsg({ text: data.error || 'Failed to update access', ok: false });
      }
    } catch {
      setAccessMsg({ text: 'Network error', ok: false });
    } finally {
      setBusyAccountId(null);
    }
  }

  function assignAccount(a: Account) {
    setAccess([...assignedIds, a.id], a.id, 'Assigned', a.name);
  }

  function removeAccount(a: Account) {
    setAccess(assignedIds.filter((id) => id !== a.id), a.id, 'Removed', a.name);
  }

  function selectForManage(id: number) {
    setManageUserId(id);
    setAccessMsg({ text: '', ok: true });
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

      {/* Manage account access */}
      <div className="panel">
        <div className="panel-title">&gt; ACCOUNT ACCESS</div>

        <div className="filters" style={{ marginBottom: 4 }}>
          <div className="filter-group">
            <div className="filter-label">&gt; SELECT USER</div>
            <select
              className="filter-field blue"
              value={manageUserId ?? ''}
              onChange={(e) => selectForManage(Number(e.target.value))}
              style={{ minWidth: 180 }}
            >
              <option value="">— choose a user —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!manageUser ? (
          <div className="notes">Select a user to assign or remove individual accounts.</div>
        ) : (
          <>
            {manageUser.role === 'admin' && (
              <div className="notes" style={{ marginBottom: 10 }}>
                Note: admins can see all accounts regardless of what is assigned here.
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 18,
                marginTop: 6,
              }}
            >
              <div>
                <div className="filter-label" style={{ marginBottom: 8 }}>
                  &gt; ASSIGNED ({assigned.length})
                </div>
                {assigned.length === 0 ? (
                  <span className="cell-empty">— none —</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {assigned.map((a) => (
                      <div
                        key={a.id}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
                      >
                        <span className="row-cell" style={{ fontSize: 13 }}>{a.name}</span>
                        <button
                          className="icon-btn"
                          onClick={() => removeAccount(a)}
                          disabled={busyAccountId === a.id}
                        >
                          {busyAccountId === a.id ? '...' : 'REMOVE'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="filter-label" style={{ marginBottom: 8 }}>
                  &gt; AVAILABLE ({available.length})
                </div>
                {available.length === 0 ? (
                  <span className="cell-empty">
                    {accounts.length === 0 ? 'No accounts exist yet.' : '— all accounts assigned —'}
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {available.map((a) => (
                      <div
                        key={a.id}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
                      >
                        <span className="row-cell" style={{ fontSize: 13 }}>{a.name}</span>
                        <button
                          className="submit-btn"
                          style={{ padding: '3px 12px', fontSize: 11 }}
                          onClick={() => assignAccount(a)}
                          disabled={busyAccountId === a.id}
                        >
                          {busyAccountId === a.id ? '...' : 'ASSIGN'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={`form-msg ${accessMsg.ok ? 'ok' : 'err'}`}>{accessMsg.text}</div>
          </>
        )}
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
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="submit-btn"
                      style={{ padding: '3px 12px', fontSize: 11, marginRight: 6 }}
                      onClick={() => selectForManage(u.id)}
                    >
                      {manageUserId === u.id ? 'SELECTED' : 'MANAGE'}
                    </button>
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
