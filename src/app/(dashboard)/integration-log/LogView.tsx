'use client';

import { Fragment, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Pagination from '@/components/Pagination';
import { SEARCH_FIELDS } from '@/lib/recordColumns';

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

export const IMPORTED_WITH_ERRORS = 'Imported with Errors';

/** Imported with Errors is its own state: the API call succeeded, but the WMS
 *  rejected the data afterwards. Amber rather than red — it needs attention,
 *  but it is not the same as never arriving. */
function statusClass(status: string): string {
  if (status === 'Success') return 'status-success';
  if (status === IMPORTED_WITH_ERRORS) return 'status-warn';
  return 'status-failed';
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
  integrationOptions,
  rows,
  total,
  statusSummary,
  pageSize,
  page,
  filters,
  columnSearch,
  fromOverview,
}: {
  accountsList: { id: number; name: string }[];
  integrationOptions: string[];
  rows: Row[];
  total: number;
  statusSummary: { status: string; count: number }[];
  pageSize: number;
  page: number;
  filters: {
    integration: string;
    result: string;
    date: string;
    from: string;
    to: string;
    q: string;
    customer: string;
  };
  columnSearch: Record<string, string>;
  fromOverview: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState('');
  const [isPending, startTransition] = useTransition();

  // Tile figures. Statuses other than Success/Failed are possible — the
  // monitor passes through anything it can't confidently normalise — so they
  // are counted separately rather than silently dropped from the totals.
  const countFor = (s: string) =>
    statusSummary.find((r) => r.status?.toLowerCase() === s)?.count ?? 0;
  const successCount = countFor('success');
  const failedCount = countFor('failed');
  const withErrorsCount = countFor(IMPORTED_WITH_ERRORS.toLowerCase());
  const otherCount = Math.max(0, total - successCount - failedCount - withErrorsCount);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const successPct = pct(successCount);
  const failedPct = pct(failedCount);

  // Draft filter state. Edits stay local until SUBMIT so the table doesn't
  // re-query on every keystroke; the URL remains the applied state.
  const [draft, setDraft] = useState({
    from: filters.from,
    to: filters.to,
    customer: filters.customer,
    integration: filters.integration,
    result: filters.result,
  });

  // Re-sync when the applied filters change from outside (Overview
  // drill-through, browser back/forward).
  useEffect(() => {
    setDraft({
      from: filters.from,
      to: filters.to,
      customer: filters.customer,
      integration: filters.integration,
      result: filters.result,
    });
  }, [filters.from, filters.to, filters.customer, filters.integration, filters.result]);

  // Search boxes (global + per column). These apply as you type, so they are
  // kept separate from the SUBMIT-driven filter bar above.
  const [search, setSearch] = useState<{ q: string; cols: Record<string, string> }>({
    q: filters.q,
    cols: columnSearch,
  });
  const typing = useRef(false);

  useEffect(() => {
    if (typing.current) return; // don't clobber what's being typed
    setSearch({ q: filters.q, cols: columnSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, JSON.stringify(columnSearch)]);

  /** Mutate the current query string and navigate. Paging always resets,
   *  because the old page number means nothing against a new result set.
   *
   *  Navigation runs inside a transition so the current table stays on screen
   *  (dimmed) while the server responds, instead of the page appearing to
   *  freeze — the data round trip is the slow part, not the rendering. */
  function pushWith(mutate: (p: URLSearchParams) => void, opts?: { keepPage?: boolean }) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    if (!opts?.keepPage) params.delete('page');
    setOpenId(null);

    const qs = params.toString();
    const next = qs ? `/integration-log?${qs}` : '/integration-log';
    const unchanged = qs === searchParams.toString();

    startTransition(() => {
      if (unchanged) {
        // Same filters re-submitted: re-query rather than no-op, so SUBMIT
        // always pulls the latest records.
        router.refresh();
      } else {
        router.push(next);
      }
    });
  }

  // Debounced so a server round trip doesn't fire on every keystroke.
  useEffect(() => {
    if (!typing.current) return;
    const t = setTimeout(() => {
      typing.current = false;
      pushWith((p) => {
        search.q ? p.set('q', search.q) : p.delete('q');
        for (const [field, value] of Object.entries(search.cols)) {
          value ? p.set(`s_${field}`, value) : p.delete(`s_${field}`);
        }
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setGlobalSearch(v: string) {
    typing.current = true;
    setSearch((s) => ({ ...s, q: v }));
  }
  function setColumnSearch(field: string, v: string) {
    typing.current = true;
    setSearch((s) => ({ ...s, cols: { ...s.cols, [field]: v } }));
  }

  function applyFilters() {
    typing.current = false;
    pushWith((params) => {
      draft.from ? params.set('from', draft.from) : params.delete('from');
      draft.to ? params.set('to', draft.to) : params.delete('to');
      draft.customer ? params.set('customer', draft.customer) : params.delete('customer');
      draft.integration && draft.integration !== 'ALL'
        ? params.set('integration', draft.integration)
        : params.delete('integration');
      draft.result && draft.result !== 'ALL'
        ? params.set('result', draft.result)
        : params.delete('result');
      params.delete('date'); // superseded by the from/to range
    });
  }

  function resetFilters() {
    typing.current = false;
    setDraft({ from: '', to: '', customer: '', integration: 'ALL', result: 'ALL' });
    setSearch({ q: '', cols: {} });
    setOpenId(null);
    startTransition(() => router.push('/integration-log'));
  }

  /** Current filters as a query string, for the export endpoint. */
  function exportQuery(extra?: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    params.delete('size');
    for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
    return params.toString();
  }

  async function copyToClipboard() {
    setBusy('COPY');
    setExportMsg('');
    try {
      const res = await fetch(`/api/records/export?${exportQuery({ format: 'tsv' })}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      const lines = Math.max(0, text.split('\n').length - 1);
      setExportMsg(`Copied ${lines} row${lines === 1 ? '' : 's'} to the clipboard.`);
    } catch {
      setExportMsg('Could not copy — your browser may block clipboard access on this page.');
    } finally {
      setBusy(null);
    }
  }

  function downloadCsv() {
    setExportMsg('');
    window.location.href = `/api/records/export?${exportQuery()}`;
  }

  // Paging lives in the URL so a page is shareable and survives a refresh.
  // Existing filter params are carried through untouched.
  function go(next: { page?: number; size?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.size !== undefined) {
      params.set('size', String(next.size));
      params.delete('page'); // a new page size invalidates the old page number
    }
    if (next.page !== undefined) params.set('page', String(next.page));
    setOpenId(null); // collapse any expanded row on navigation
    router.push(`/integration-log?${params.toString()}`);
  }

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

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
      >
        <div className="filter-group">
          <div className="filter-label">&gt; START_DATE</div>
          <input
            className="filter-field"
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            style={{ minWidth: 130 }}
          />
        </div>
        <div className="filter-group">
          <div className="filter-label">&gt; END_DATE</div>
          <input
            className="filter-field"
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            style={{ minWidth: 130 }}
          />
        </div>
        <div className="filter-group">
          <div className="filter-label">&gt; CUSTOMER</div>
          <select
            className="filter-field blue"
            value={draft.customer}
            onChange={(e) => setDraft({ ...draft, customer: e.target.value })}
            style={{ minWidth: 150 }}
          >
            <option value="">ALL CUSTOMERS</option>
            {accountsList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <div className="filter-label">&gt; INTEGRATION</div>
          <select
            className="filter-field"
            value={draft.integration}
            onChange={(e) => setDraft({ ...draft, integration: e.target.value })}
            style={{ minWidth: 120 }}
          >
            <option value="ALL">ALL</option>
            {integrationOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <div className="filter-label">&gt; RESULT</div>
          <select
            className="filter-field"
            value={draft.result}
            onChange={(e) => setDraft({ ...draft, result: e.target.value })}
            style={{ minWidth: 90 }}
          >
            <option value="ALL">ALL</option>
            <option value="Success">Success</option>
            <option value={IMPORTED_WITH_ERRORS}>Imported with Errors</option>
            <option value="Failed">Failed</option>
          </select>
        </div>
        <button className="submit-btn" type="submit">[ SUBMIT ]</button>
        <button className="submit-btn" type="button" onClick={resetFilters}>[ RESET ]</button>
      </form>

      <div className="divider">{'═'.repeat(120)}</div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ flex: '0 1 auto' }}>
          <p className="notes">* Records processed more than once show the latest occurrence and status.</p>
          <p className="notes">* RETRIES counts the extra attempts before the outcome shown.</p>
          <p className="notes" style={{ marginBottom: 12 }}>
            * Click a row for its payloads; payloads are kept for 24 hours, then cleared.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} className="no-print">
          <button
            className="submit-btn"
            style={{ padding: '5px 12px', fontSize: 12 }}
            onClick={copyToClipboard}
            disabled={busy === 'COPY' || total === 0}
            title="Copy all filtered rows to the clipboard"
          >
            {busy === 'COPY' ? 'COPYING…' : 'COPY'}
          </button>
          <button
            className="submit-btn"
            style={{ padding: '5px 12px', fontSize: 12 }}
            onClick={downloadCsv}
            disabled={total === 0}
            title="Download all filtered rows as CSV"
          >
            CSV
          </button>
          <button
            className="submit-btn"
            style={{ padding: '5px 12px', fontSize: 12 }}
            onClick={() => window.print()}
            title="Print, or choose 'Save as PDF' in the print dialog"
          >
            PRINT / PDF
          </button>
          </div>
        </div>

        <div className="tiles" style={{ flex: '1 1 300px', maxWidth: 520 }}>
          <div className="tile">
            <div className="tile-label">&gt; TOTAL</div>
            <div className="tile-value">{total.toLocaleString()}</div>
            <div className="tile-sub">records matching filters</div>
          </div>
          <div className="tile">
            <div className="tile-label">&gt; SUCCESS</div>
            <div className="tile-value ok">{successCount.toLocaleString()}</div>
            <div className="tile-sub">{total ? `${successPct}% of total` : '—'}</div>
          </div>
          {withErrorsCount > 0 && (
            <div className="tile">
              <div className="tile-label">&gt; WITH ERRORS</div>
              <div className="tile-value warn">{withErrorsCount.toLocaleString()}</div>
              <div className="tile-sub">stuck in the WMS</div>
            </div>
          )}
          <div className="tile">
            <div className="tile-label">&gt; FAILED</div>
            <div className="tile-value bad">{failedCount.toLocaleString()}</div>
            <div className="tile-sub">{total ? `${failedPct}% of total` : '—'}</div>
          </div>
          {otherCount > 0 && (
            <div className="tile">
              <div className="tile-label">&gt; OTHER</div>
              <div className="tile-value">{otherCount.toLocaleString()}</div>
              <div className="tile-sub">non-standard status</div>
            </div>
          )}
        </div>

        <div className="no-print">
          <div className="filter-label" style={{ fontSize: 12 }}>
            &gt; SEARCH{isPending ? ' · WORKING…' : ''}
          </div>
          <input
            className="filter-field"
            placeholder="Search all..."
            value={search.q}
            onChange={(e) => setGlobalSearch(e.target.value)}
            style={{ minWidth: 160 }}
          />
        </div>
      </div>

      {exportMsg && (
        <div className="notes" style={{ marginBottom: 10 }}>
          {exportMsg}
        </div>
      )}

      <div
        style={{
          overflowX: 'auto',
          opacity: isPending ? 0.5 : 1,
          transition: 'opacity 120ms ease',
        }}
        aria-busy={isPending}
      >
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
            <tr className="no-print">
              {SEARCH_FIELDS.map((field) => (
                <td key={field} style={{ padding: '4px 6px' }}>
                  <input
                    className="filter-field"
                    placeholder="Search..."
                    aria-label={`Search ${field}`}
                    value={search.cols[field] ?? ''}
                    onChange={(e) => setColumnSearch(field, e.target.value)}
                    style={{ minWidth: 0, width: '100%', fontSize: 11, padding: '3px 6px' }}
                  />
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
                  <td className={statusClass(r.status)} style={{ whiteSpace: 'nowrap' }}>
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

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={(p) => go({ page: p })}
        onPageSize={(s) => go({ size: s })}
      />

      <div className="footer-bar">{'═'.repeat(120)}</div>
      <div className="ready">READY<span className="crt-cursor">_</span></div>
    </>
  );
}
