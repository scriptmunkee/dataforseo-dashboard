import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ago, fmt, fmtDate, fmtMoney, getJson } from '../lib/api.js';
import { Card, DataTable, ErrorBox, Kpi, KpiRow } from '../components/ui.jsx';

const shortPath = (p) => (p || '').replace(/^dataforseo_labs\/google\//, 'labs/').replace(/\/live(\/advanced)?$/, '');

export default function Usage() {
  const [costs, setCosts] = useState(null);
  const [cache, setCache] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, k] = await Promise.all([getJson('/api/costs'), getJson('/api/cache')]);
      setCosts(c); setCache(k); setError(null);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const clear = async (key) => {
    if (!key && !window.confirm('Clear the whole cache? Next lookups will cost credits again.')) return;
    await getJson('/api/cache' + (key ? '/' + key : ''), { method: 'DELETE' });
    load();
  };

  const saved = cache ? cache.items.reduce((a, i) => a + (i.cost || 0), 0) : 0;

  return (
    <div className="stack">
      <ErrorBox error={error} />
      {costs && (
        <KpiRow>
          <Kpi label="Spent today" value={fmtMoney(costs.today, 3)} />
          <Kpi label="Last 30 days" value={fmtMoney(costs.last30, 2)} />
          <Kpi label="All time" value={fmtMoney(costs.allTime, 2)} sub={`${fmt(costs.calls)} live calls`} />
          <Kpi label="Cached responses" value={fmt(cache?.count)} sub={`${((cache?.bytes || 0) / 1048576).toFixed(1)} MB on disk`} />
          <Kpi label="Value held in cache" value={fmtMoney(saved, 2)} sub="re-runs of these are free" tone="good" />
        </KpiRow>
      )}

      {costs && (
        <div className="grid-2">
          <Card title="Daily spend, 30 days">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={costs.byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(d) => d.slice(5)} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => '$' + v.toFixed(2)} tickLine={false} axisLine={false} width={50} />
                <Tooltip formatter={(v) => fmtMoney(v, 4)} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="cost" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Spend by endpoint" pad={false}>
            <DataTable
              exportName="spend_by_endpoint"
              rows={costs.byPath}
              pageSize={10}
              initialSort={{ key: 'cost', dir: 'desc' }}
              columns={[
                { key: 'path', label: 'Endpoint', render: (r) => <code>{shortPath(r.path)}</code> },
                { key: 'cost', label: 'Cost', num: true, render: (r) => fmtMoney(r.cost, 4) },
              ]}
            />
          </Card>
        </div>
      )}

      {cache && (
        <Card title="Cache" pad={false} actions={<button className="btn btn-ghost btn-sm" onClick={() => clear()}>Clear all</button>}>
          <DataTable
            exportName="cache"
            rows={cache.items.map((i) => ({ ...i, query: i.payload?.target || i.payload?.keyword || (i.payload?.keywords || []).slice(0, 3).join(', ') || i.payload?.target1 || JSON.stringify(i.payload?.target || '') }))}
            pageSize={25}
            initialSort={{ key: 'fetchedAt', dir: 'desc' }}
            columns={[
              { key: 'path', label: 'Endpoint', render: (r) => <code>{shortPath(r.path)}</code> },
              { key: 'query', label: 'Query', csv: (r) => (typeof r.query === 'string' ? r.query : JSON.stringify(r.query)), render: (r) => (typeof r.query === 'string' ? r.query : JSON.stringify(r.query)) },
              { key: 'loc', label: 'Loc', render: (r) => r.payload?.location_code || '–' },
              { key: 'fetchedAt', label: 'Fetched', num: true, csv: (r) => fmtDate(r.fetchedAt), render: (r) => <span title={fmtDate(r.fetchedAt)}>{ago(r.fetchedAt)}</span> },
              { key: 'cost', label: 'Cost', num: true, render: (r) => fmtMoney(r.cost, 4) },
              { key: 'x', label: '', sortable: false, render: (r) => <button className="icon-btn remove" title="Drop from cache" onClick={() => clear(r.key)}>×</button> },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
