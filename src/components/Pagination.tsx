'use client';

/**
 * Shared pagination control.
 *
 * Presentational only — it reports intent through `onPage` / `onPageSize` and
 * leaves the caller to decide whether that means a URL change (server-paged
 * tables) or local state (client-paged tables).
 *
 * A pageSize of 0 means "All".
 */

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 0] as const;

export function sizeLabel(size: number): string {
  return size === 0 ? 'All' : String(size);
}

/** Total pages for a given row count, never less than 1. */
export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Clamp a requested page into the valid range. */
export function clampPage(page: number, total: number, pageSize: number): number {
  const max = pageCount(total, pageSize);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.trunc(page), max);
}

/**
 * Page numbers to render, with `null` marking a gap. Keeps the control a fixed
 * width regardless of how many pages exist.
 */
function pageWindow(current: number, last: number): (number | null)[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);

  const out: (number | null)[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(last - 1, current + 1);

  if (from > 2) out.push(null);
  for (let p = from; p <= to; p++) out.push(p);
  if (to < last - 1) out.push(null);
  out.push(last);
  return out;
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  label = 'entries',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  label?: string;
}) {
  const last = pageCount(total, pageSize);
  const current = clampPage(page, total, pageSize);
  const from = total === 0 ? 0 : (current - 1) * (pageSize || total) + 1;
  const to = pageSize <= 0 ? total : Math.min(total, current * pageSize);

  const numBtn = (active: boolean) => ({
    padding: '3px 10px',
    fontSize: 12,
    cursor: active ? 'default' : 'pointer',
    minWidth: 30,
  });

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        marginTop: 14,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-muted)' }}>
          Showing {from} to {to} of {total} {label}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
          Show
          <select
            className="filter-field"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            style={{ minWidth: 0, width: 'auto', padding: '3px 6px', fontSize: 12 }}
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {sizeLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {last > 1 && (
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} aria-label="Pagination">
          <button
            className="submit-btn"
            style={{ padding: '3px 10px', fontSize: 12 }}
            onClick={() => onPage(current - 1)}
            disabled={current <= 1}
          >
            PREV
          </button>

          {pageWindow(current, last).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} style={{ color: 'var(--text-faint)', padding: '0 2px' }}>
                …
              </span>
            ) : p === current ? (
              <button key={p} className="submit-btn" style={numBtn(true)} aria-current="page" disabled>
                {p}
              </button>
            ) : (
              <button
                key={p}
                className="badge"
                style={{ ...numBtn(false), background: 'transparent', fontFamily: 'inherit' }}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            ),
          )}

          <button
            className="submit-btn"
            style={{ padding: '3px 10px', fontSize: 12 }}
            onClick={() => onPage(current + 1)}
            disabled={current >= last}
          >
            NEXT
          </button>
        </nav>
      )}
    </div>
  );
}
