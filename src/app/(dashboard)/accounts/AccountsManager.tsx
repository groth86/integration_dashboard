'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Pagination, { clampPage } from '@/components/Pagination';

type AccountRow = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  recordCount: number;
  userCount: number;
  lastRecordAt: string | null;
};

function stamp(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB') : '—';
}

export default function AccountsManager() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>({ text: '', ok: true });

  const [busyId, setBusyId] = useState<number | null>(null);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [showInactive, setShowInactive] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(async () => {
    const res = await fetch('/api/accounts?manage=1');
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setMsg({ text: 'Enter an account name.', ok: false });
      return;
    }
    setCreating(true);
    setMsg({ text: '', ok: true });
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ text: `Created "${data.name}".`, ok: true });
        setNewName('');
        await load();
      } else {
        setMsg({ text: data.error || 'Could not create account', ok: false });
      }
    } catch {
      setMsg({ text: 'Network error', ok: false });
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>, okText: string) {
    setBusyId(id);
    setMsg({ text: '', ok: true });
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ text: okText, ok: true });
        await load();
      } else {
        setMsg({ text: data.error || 'Update failed', ok: false });
      }
    } catch {
      setMsg({ text: 'Network error', ok: false });
    } finally {
      setBusyId(null);
    }
  }

  function toggleActive(a: AccountRow) {
    const next = !a.isActive;
    if (!next && a.recordCount > 0) {
      const ok = confirm(
        `Deactivate "${a.name}"?\n\n` +
          `${a.recordCount.toLocaleString()} record(s) will be hidden from the Overview, ` +
          `Integration Log, filters and exports.\n\nNothing is deleted — reactivating restores everything.`,
      );
      if (!ok) return;
    }
    patch(a.id, { isActive: next }, `"${a.name}" is now ${next ? 'active' : 'inactive'}.`);
  }

  function startRename(a: AccountRow) {
    setRenameId(renameId === a.id ? null : a.id);
    setRenameValue(a.name);
    setMsg({ text: '', ok: true });
  }

  async function saveRename(a: AccountRow) {
    const name = renameValue.trim();
    if (!name) {
      setMsg({ text: 'Account name cannot be empty.', ok: false });
      return;
    }
    if (name === a.name) {
      setRenameId(null);
      return;
    }
    await patch(a.id, { name }, `Renamed to "${name}".`);
    setRenameId(null);
  }

  const visible = showInactive ? rows : rows.filter((r) => r.isActive);
  const current = clampPage(page, visible.length, pageSize);
  const paged = pageSize > 0 ? visible.slice((current - 1) * pageSize, current * pageSize) : visible;
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <>
      <div className="title-banner">
        <div className="title-text">
          ACCOUNT MANAGEMENT<span className="crt-cursor" style={{ color: 'var(--green)' }}>_</span>
        </div>
      </div>

      <div className="tiles" style={{ maxWidth: 560, marginBottom: 18 }}>
        <div className="tile">
          <div className="tile-label">&gt; TOTAL</div>
          <div className="tile-value">{rows.length}</div>
          <div className="tile-sub">accounts</div>
        </div>
        <div className="tile">
          <div className="tile-label">&gt; ACTIVE</div>
          <div className="tile-value ok">{activeCount}</div>
          <div className="tile-sub">visible across the app</div>
        </div>
        <div className="tile">
          <div className="tile-label">&gt; INACTIVE</div>
          <div className="tile-value bad">{rows.length - activeCount}</div>
          <div className="tile-sub">hidden everywhere else</div>
        </div>
      </div>

      {/* Create */}
      <div className="panel">
        <div className="panel-title">&gt; ADD ACCOUNT</div>
        <form onSubmit={createAccount}>
          <div className="filters" style={{ marginBottom: 4 }}>
            <div className="filter-group">
              <div className="filter-label">&gt; ACCOUNT NAME</div>
              <input
                className="filter-field"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Aarke USA (Amazon)"
                style={{ minWidth: 260 }}
              />
            </div>
            <button className="submit-btn" type="submit" disabled={creating}>
              {creating ? '[ ADDING... ]' : '[ ADD ACCOUNT ]'}
            </button>
          </div>
          <div className={`form-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>
          <div className="notes">
            The name must match exactly what the integration sends, or its records will create a
            second account instead of attaching to this one.
          </div>
        </form>
      </div>

      {/* List */}
      <div className="panel">
        <div
          className="panel-title"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
        >
          <span>&gt; ACCOUNTS</span>
          <label className="checkline" style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => {
                setShowInactive(e.target.checked);
                setPage(1);
              }}
            />
            Show inactive
          </label>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <td>ACCOUNT</td>
                <td>STATUS</td>
                <td style={{ textAlign: 'right' }}>RECORDS</td>
                <td style={{ textAlign: 'right' }}>USERS</td>
                <td>LAST RECORD</td>
                <td></td>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="cell-empty" colSpan={6}>Loading…</td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td className="cell-empty" colSpan={6}>
                    No accounts yet. Add one above, or let an integration create it on first delivery.
                  </td>
                </tr>
              )}
              {paged.map((a) => (
                <Fragment key={a.id}>
                  <tr style={{ opacity: a.isActive ? 1 : 0.6 }}>
                    <td className="row-cell">{a.name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {a.isActive ? (
                        <span className="status-success" style={{ padding: '2px 8px' }}>ACTIVE</span>
                      ) : (
                        <span className="status-failed" style={{ padding: '2px 8px' }}>INACTIVE</span>
                      )}
                    </td>
                    <td className="row-cell" style={{ textAlign: 'right' }}>
                      {a.recordCount.toLocaleString()}
                    </td>
                    <td className="row-cell" style={{ textAlign: 'right' }}>{a.userCount}</td>
                    <td className="row-cell" style={{ whiteSpace: 'nowrap' }}>{stamp(a.lastRecordAt)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="submit-btn"
                        style={{ padding: '3px 12px', fontSize: 11, marginRight: 6 }}
                        onClick={() => startRename(a)}
                        disabled={busyId === a.id}
                      >
                        {renameId === a.id ? 'CANCEL' : 'RENAME'}
                      </button>
                      <button
                        className={a.isActive ? 'icon-btn' : 'submit-btn'}
                        style={a.isActive ? undefined : { padding: '3px 12px', fontSize: 11 }}
                        onClick={() => toggleActive(a)}
                        disabled={busyId === a.id}
                      >
                        {busyId === a.id ? '...' : a.isActive ? 'DEACTIVATE' : 'ACTIVATE'}
                      </button>
                    </td>
                  </tr>

                  {renameId === a.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: '10px 12px' }}>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveRename(a);
                          }}
                          style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}
                        >
                          <div className="filter-group">
                            <div className="filter-label">&gt; NEW NAME</div>
                            <input
                              className="filter-field"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              style={{ minWidth: 260 }}
                            />
                          </div>
                          <button className="submit-btn" type="submit" disabled={busyId === a.id}>
                            [ SAVE NAME ]
                          </button>
                          <span className="notes" style={{ maxWidth: 420 }}>
                            Renaming does not move existing records — they stay attached by id. But
                            incoming data is matched by name, so update the integration to match.
                          </span>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={current}
          pageSize={pageSize}
          total={visible.length}
          onPage={setPage}
          onPageSize={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          label="accounts"
        />

        <div className="notes" style={{ marginTop: 10 }}>
          * Inactive accounts are hidden from the Overview, Integration Log, every dropdown and all
          exports. Nothing is deleted and user assignments are preserved.
        </div>
        <div className="notes">
          * An account that is still receiving data will reactivate itself on the next delivery. To
          keep one hidden, stop its workflow from sending first.
        </div>
      </div>

      <div className="footer-bar">{'═'.repeat(120)}</div>
      <div className="ready">READY<span className="crt-cursor">_</span></div>
    </>
  );
}
