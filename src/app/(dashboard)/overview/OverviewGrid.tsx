'use client';

import { useRouter } from 'next/navigation';

type Agg = Record<string, Record<string, { success: number; total: number }>>;

export default function OverviewGrid({
  accountsList,
  days,
  integrationTypes,
  agg,
  startLabel,
  endLabel,
}: {
  accountsList: { id: number; name: string }[];
  days: { key: string; label: string }[];
  integrationTypes: string[];
  agg: Agg;
  startLabel: string;
  endLabel: string;
}) {
  const router = useRouter();

  function cellClass(cell?: { success: number; total: number }) {
    if (!cell || cell.total === 0) return 'cell-empty';
    if (cell.success === cell.total) return 'cell-success';
    if (cell.success === 0) return 'cell-failed';
    return 'cell-mixed';
  }

  function drill(integration: string, dayKey: string) {
    const params = new URLSearchParams({ integration, date: dayKey, result: 'ALL' });
    router.push('/integration-log?' + params.toString());
  }

  return (
    <>
      <div className="title-banner">
        <div className="title-text">
          ACCOUNT OVERVIEW<span className="crt-cursor" style={{ color: 'var(--green)' }}>_</span>
        </div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <div className="filter-label">&gt; START_DATE</div>
          <input className="filter-field" type="text" defaultValue={startLabel} />
        </div>
        <div className="filter-group">
          <div className="filter-label">&gt; END_DATE</div>
          <input className="filter-field" type="text" defaultValue={endLabel} />
        </div>
        <div className="filter-group">
          <div className="filter-label">&gt; CUSTOMER</div>
          <select className="filter-field blue">
            {accountsList.map((a) => (
              <option key={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <button className="submit-btn">[ SUBMIT ]</button>
      </div>

      <div className="divider">{'═'.repeat(120)}</div>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <td>INTEGRATION</td>
              {days.map((d) => (
                <td key={d.key}>{d.label}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {integrationTypes.length === 0 && (
              <tr>
                <td className="cell-empty" colSpan={days.length + 1}>
                  No integration records in this window.
                </td>
              </tr>
            )}
            {integrationTypes.map((type) => (
              <tr key={type}>
                <td>{type}</td>
                {days.map((d) => {
                  const cell = agg[type]?.[d.key];
                  const cls = cellClass(cell);
                  return (
                    <td
                      key={d.key}
                      className={cls}
                      onClick={cell && cell.total > 0 ? () => drill(type, d.key) : undefined}
                    >
                      {cell && cell.total > 0 ? `${cell.success}/${cell.total}` : '--'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="footer-bar">{'═'.repeat(120)}</div>
      <div className="ready">
        READY<span className="crt-cursor">_</span>
      </div>
    </>
  );
}
