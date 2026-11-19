'use client';

import { Fragment, useEffect, useState } from 'react';

type Row = {
  id: number;
  timestamp: string;
  businessUnit: string | null;
  system: string | null;
  direction: string | null;
  integrationType: string;
  recordId: string | null;
  status: string;
  response: string | null;
  workflow: string | null;
  orderReference: string | null;
  responseCode: number | null;
  responseDescription: string | null;
  attemptCount: number;
  hasPayload: boolean;
};

type Detail = {
  workflow: string | null;
  recordId: string | null;
  attemptCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  payloadStoredAt: string | null;
  retentionHours: number;
  requestPayload: string | null;
  responsePayload: string | null;
};

function pretty(p: string | null): string {
  if (!p) return '';
  try {
    return JSON.stringify(JSON.parse(p), null, 2);
  } catch {
    return p;
  }
}

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleString('en-GB') : '—';
}

function RecordDetail({ id, colSpan }: { id: number; colSpan: number }) {
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: Detail }>({ loading: true });
  useEffect(() => {
    let live = true;
    fetch(`/api/records/${id}`)
      .then(async (r) => {
        if (!live) return;
        if (r.ok) setState({ loading: false, data: await r.json() });
        else setState({ loading: false, error: `HTTP ${r.status}` });
      })
      .catch((e) => live && setState({ loading: false, error: String(e) }));
    return () => {
      live = false;
    };
  }, [id]);
  const d = state.data;
  const preStyle = { whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const, maxHeight: 320, overflow: 'auto', margin: '4px 0 10px', fontSize: 11 };
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '8px 12px' }}>
        {state.loading && <div className="notes">Loading…</div>}
        {state.error && <div className="status-failed">Could not load record: {state.error}</div>}
        {d && (
          <div>
            <div className="notes" style={{ marginBottom: 8 }}>
              Workflow: {d.workflow ?? '—'} · Key: {d.recordId ?? '—'} · First seen: {fmt(d.firstSeenAt)} · Last seen: {fmt(d.lastSeenAt)} ·
              Attempts: {d.attemptCount}
            </div>
            {d.payloadStoredAt ? (
              <>
                <div className="filter-label">&gt; REQUEST PAYLOAD</div>
                <pre style={preStyle}>{pretty(d.requestPayload) || '(none sent)'}</pre>
                <div className="filter-label">&gt; RESPONSE PAYLOAD</div>
                <pre style={preStyle}>{pretty(d.responsePayload) || '(none sent)'}</pre>
                <div className="notes">Payloads stored {fmt(d.payloadStoredAt)}; cleared {d.retentionHours}h after storing.</div>
              </>
            ) : (
              <div className="notes">No payload held — payloads are kept for {d.retentionHours} hours after the latest attempt, then cleared.</div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function LogView({
  accountsList,
  rows,
  total,
  pageSize,
  filters,
  fromOverview,
}: {
  accountsList: { id: number; name: string }[];
  rows: Row[];
  total: number;
  pageSize: number;
  filters: { integration: string; result: string; date: string; customer: string };
  fromOverview: boolean;
}) {
  const shownTo = Math.min(rows.length, pageSize);
  const [openId, setOpenId] = useState<number | null>(null);
  const COLS = 11;
  const dateLabel = filters.date
    ? new Date(filters.date + 'T00:00:00').toLocaleDateString('en-GB')
    : '';

  return (
    <>
      <div className="title-banner" style={{ marginBottom: 12 }}>
        <div className="title-text">
          INTEGRATION LOG<span className="crt-cursor" style={{ color: 'var(--green)' }}>_</span>
        </div>
      </div>

      {fromOverview && (
        <div className="notes" style={{ marginBottom: 16 }}>
          &gt; FILTERS SET FROM ACCOUNT OVERVIEW: {dateLabel} &middot; {filters.integration}
          {filters.result !== 'ALL' ? ` · ${filters.result}` : ''}
        </div>
      )}

      <div className="filters">
        <div className="filter-group">
          <div className="filter-label">&gt; START_DATE</div>
          <input className="filter-field" type="text" defaultValue={dateLabel} style={{ minWidth: 100 }} />
        </div>
        <div className="filter-group">
          <div className="filter-label">&gt; END_DATE</div>
          <input className="filter-field" type="text" defaultValue={dateLabel} style={{ minWidth: 100 }} />
        </div>
        <div className="filter-group">
          <div className="filter-label">&gt; CUSTOMER</div>
          <select className="filter-field blue" style={{ minWidth: 150 }}>
            {accountsList.map((a) => (
              <option key={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <div className="filter-label">&gt; INTEGRATION</div>
          <select className="filter-field" defaultValue={filters.integration} style={{ minWidth: 120 }}>
            <option>ALL</option>
            <option>Inventory Update</option>
            <option>Sales Order</option>
            <option>Sales Order Fulfilment</option>
          </select>
        </div>
        <div className="filter-group">
          <div className="filter-label">&gt; RESULT</div>
          <select className="filter-field" defaultValue={filters.result} style={{ minWidth: 90 }}>
            <option>ALL</option>
            <option>Success</option>
            <option>Failed</option>
          </select>
        </div>
        <button className="submit-btn">[ SUBMIT ]</button>
      </div>

      <div className="divider">{'═'.repeat(120)}</div>
      <p className="notes">* Records processed more than once show the latest occurrence and status.</p>
      <p className="notes">* RETRIES counts the extra attempts before the outcome shown.</p>
      <p className="notes" style={{ marginBottom: 14 }}>* Click a row for its payloads; payloads are kept for 24 hours, then cleared.</p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['SHOW 25 ▾', 'COPY', 'CSV', 'EXCEL', 'PDF', 'PRINT'].map((b) => (
            <button key={b} className="submit-btn" style={{ padding: '5px 12px', fontSize: 12 }}>
              {b}
            </button>
          ))}
        </div>
        <div>
          <div className="filter-label" style={{ fontSize: 12 }}>&gt; SEARCH</div>
          <input className="filter-field" placeholder="Search all..." style={{ minWidth: 160 }} />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <td>TIMESTAMP</td>
              <td>BUSINESS UNIT</td>
              <td>SYSTEM</td>
              <td>DIRECTION</td>
              <td>INTEGRATION</td>
              <td>ORDER REF</td>
              <td>RECORD ID</td>
              <td>STATUS</td>
              <td>CODE</td>
              <td>RETRIES</td>
              <td>RESPONSE</td>
            </tr>
            <tr>
              {Array.from({ length: COLS }).map((_, i) => (
                <td key={i} style={{ padding: '4px 6px' }}>
                  <input className="filter-field" placeholder="Search..." style={{ minWidth: 0, width: '100%', fontSize: 11, padding: '3px 6px' }} />
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="cell-empty" colSpan={COLS}>No records match these filters.</td>
              </tr>
            )}
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr
                  onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  style={{ cursor: 'pointer' }}
                  title="Click for details and payloads"
                >
                  <td style={{ color: 'var(--green-dim)', whiteSpace: 'nowrap' }}>
                    {openId === r.id ? '▾ ' : '▸ '}
                    {r.timestamp}
                  </td>
                  <td className="row-cell" style={{ whiteSpace: 'nowrap' }}>{r.businessUnit}</td>
                  <td className="row-cell" style={{ whiteSpace: 'nowrap' }}>{r.system}</td>
                  <td className="row-cell">{r.direction}</td>
                  <td className="row-cell" style={{ whiteSpace: 'nowrap' }}>{r.integrationType}</td>
                  <td className="rec-id" style={{ whiteSpace: 'nowrap' }}>{r.orderReference}</td>
                  <td className="rec-id">{r.recordId}</td>
                  <td className={r.status === 'Success' ? 'status-success' : 'status-failed'} style={{ whiteSpace: 'nowrap' }}>
                    {r.status}
                  </td>
                  <td className="row-cell">{r.responseCode ?? ''}</td>
                  <td className="row-cell" style={{ textAlign: 'right' }}>{Math.max(0, r.attemptCount - 1)}</td>
                  <td className="response-text">{r.responseDescription ?? r.response}</td>
                </tr>
                {openId === r.id && <RecordDetail id={r.id} colSpan={COLS} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 10, fontSize: 12 }}>
        <div style={{ color: 'var(--text-muted)' }}>
          Showing {total === 0 ? 0 : 1} to {shownTo} of {total} entries
        </div>
      </div>

      <div className="footer-bar">{'═'.repeat(120)}</div>
      <div className="ready">READY<span className="crt-cursor">_</span></div>
    </>
  );
}
