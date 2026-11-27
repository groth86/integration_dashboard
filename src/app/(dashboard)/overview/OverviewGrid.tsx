'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Pagination, { clampPage } from '@/components/Pagination';

type Agg = Record<string, Record<string, { success: number; withErrors?: number; total: number }>>;

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

  // The full grid is already in memory, so paging is local — no round trip.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const total = integrationTypes.length;
  const current = clampPage(page, total, pageSize);
  const visibleTypes =
    pageSize > 0
      ? integrationTypes.slice((current - 1) * pageSize, current * pageSize)
      : integrationTypes;

  function cellClass(cell?: { success: number; withErrors?: number; total: number }) {
    if (!cell || cell.total === 0) return 'cell-empty';
    if (cell.success === cell.total) return 'cell-success';
    const withErrors = cell.withErrors ?? 0;
    // Nothing outright failed — the shortfall is records stuck in the WMS, so
    // warn rather than showing red.
    if (cell.success + withErrors === cell.total) return 'cell-mixed';
    if (cell.success === 0 && withErrors === 0) return 'cell-failed';
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
            {visibleTypes.map((type) => (
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

      <Pagination
        page={current}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        label="integrations"
      />

      <div className="footer-bar">{'═'.repeat(120)}</div>
      <div className="ready">
        READY<span className="crt-cursor">_</span>
      </div>
    </>
  );
}
