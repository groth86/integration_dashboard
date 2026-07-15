'use client';

type Row = {
  timestamp: string;
  businessUnit: string | null;
  system: string | null;
  direction: string | null;
  integrationType: string;
  recordId: string | null;
  status: string;
  response: string | null;
};

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
      <p className="notes" style={{ marginBottom: 14 }}>* Data in this report is updated once per hour.</p>

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
              <td>RECORD ID</td>
              <td>STATUS</td>
              <td>RESPONSE</td>
            </tr>
            <tr>
              {Array.from({ length: 8 }).map((_, i) => (
                <td key={i} style={{ padding: '4px 6px' }}>
                  <input className="filter-field" placeholder="Search..." style={{ minWidth: 0, width: '100%', fontSize: 11, padding: '3px 6px' }} />
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="cell-empty" colSpan={8}>No records match these filters.</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--green-dim)', whiteSpace: 'nowrap' }}>{r.timestamp}</td>
                <td className="row-cell" style={{ whiteSpace: 'nowrap' }}>{r.businessUnit}</td>
                <td className="row-cell" style={{ whiteSpace: 'nowrap' }}>{r.system}</td>
                <td className="row-cell">{r.direction}</td>
                <td className="row-cell" style={{ whiteSpace: 'nowrap' }}>{r.integrationType}</td>
                <td className="rec-id">{r.recordId}</td>
                <td className={r.status === 'Success' ? 'status-success' : 'status-failed'} style={{ whiteSpace: 'nowrap' }}>
                  {r.status}
                </td>
                <td className="response-text">{r.response}</td>
              </tr>
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
