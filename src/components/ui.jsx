import { useMemo, useState } from 'react';
import { ago, downloadCsv, fmtDate, fmtMoney } from '../lib/api.js';

export function Card({ title, actions, children, pad = true, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <h3>{title}</h3>
          <div className="card-actions">{actions}</div>
        </header>
      )}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`kpi ${tone ? 'kpi-' + tone : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function KpiRow({ children }) {
  return <div className="kpi-row">{children}</div>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="error-box"><strong>Request failed.</strong> {error}</div>;
}

export function Empty({ title = 'Nothing here yet', children }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="empty-sub">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Fetching data' }) {
  return <div className="loading"><span className="spinner" /> {label}…</div>;
}

// Shows where the data came from and offers a forced refresh
export function ResultMeta({ meta, onRefresh, loading }) {
  if (!meta) return null;
  return (
    <div className="result-meta">
      {meta.cached ? (
        <span className="badge badge-cache" title={fmtDate(meta.fetchedAt)}>Cached · {ago(meta.fetchedAt)} · free</span>
      ) : (
        <span className="badge badge-live" title={fmtDate(meta.fetchedAt)}>Live · cost {fmtMoney(meta.cost)}</span>
      )}
      {onRefresh && (
        <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => onRefresh(true)} title="Ignore the cache and pull fresh data (costs credits)">
          ↻ Refresh
        </button>
      )}
    </div>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sparkline({ values = [], width = 90, height = 24, color = '#2563eb' }) {
  if (!values.length) return <span className="muted">–</span>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} className="sparkline" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Pos({ n }) {
  if (n === null || n === undefined) return <span className="muted">–</span>;
  const tone = n <= 3 ? 'pos-top' : n <= 10 ? 'pos-p1' : n <= 20 ? 'pos-p2' : 'pos-low';
  return <span className={`pos ${tone}`}>{n}</span>;
}

export function Kd({ n }) {
  if (n === null || n === undefined) return <span className="muted">–</span>;
  const tone = n < 30 ? 'kd-easy' : n < 60 ? 'kd-mid' : 'kd-hard';
  return <span className={`kd ${tone}`}>{n}</span>;
}

export function Intent({ v }) {
  if (!v) return <span className="muted">–</span>;
  return <span className={`intent intent-${v}`}>{v.slice(0, 4)}</span>;
}

export function ExtLink({ href, children }) {
  if (!href) return <span className="muted">–</span>;
  return <a href={href} target="_blank" rel="noreferrer" className="ext" title={href}>{children || href}</a>;
}

// Sortable, searchable table with CSV export and progressive paging
export function DataTable({ columns, rows, initialSort, exportName = 'export', pageSize = 50, toolbar, emptyText = 'No rows', onRowClick }) {
  const [sort, setSort] = useState(initialSort || null); // { key, dir }
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(pageSize);

  const sortVal = (r, key) => {
    const col = columns.find((c) => c.key === key);
    return col?.sortValue ? col.sortValue(r) : r[key];
  };

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => columns.some((c) => {
      const v = c.csv ? c.csv(r) : r[c.key];
      return v !== null && v !== undefined && String(v).toLowerCase().includes(needle);
    }));
  }, [rows, q, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const out = [...filtered];
    out.sort((a, b) => {
      const va = sortVal(a, sort.key);
      const vb = sortVal(b, sort.key);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);

  const toggle = (key) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: columns.find((c) => c.key === key)?.num ? 'desc' : 'asc' }));
  };

  return (
    <div className="table-wrap">
      <div className="table-toolbar">
        <input className="input input-sm" placeholder="Filter rows…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(pageSize); }} />
        <span className="muted small">{filtered.length.toLocaleString()} rows</span>
        <div className="spacer" />
        {toolbar}
        <button className="btn btn-ghost btn-sm" onClick={() => downloadCsv(exportName, columns, sorted)} disabled={!sorted.length}>
          ⤓ CSV
        </button>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.num ? 'num' : ''} style={{ width: c.width }} onClick={() => c.sortable !== false && toggle(c.key)}>
                  {c.label}
                  {sort?.key === c.key && <span className="sort">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((r, i) => (
              <tr key={i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'clickable' : ''}>
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : c.className || ''}>
                    {c.render ? c.render(r) : r[c.key] ?? <span className="muted">–</span>}
                  </td>
                ))}
              </tr>
            ))}
            {!sorted.length && (
              <tr><td colSpan={columns.length} className="muted center">{emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <div className="table-more">
          <button className="btn btn-ghost btn-sm" onClick={() => setLimit((l) => l + pageSize * 2)}>
            Show more ({(sorted.length - limit).toLocaleString()} left)
          </button>
        </div>
      )}
    </div>
  );
}
