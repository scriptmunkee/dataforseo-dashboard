import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../App.jsx';
import { cleanDomain, dfs, fmt, fmtCompact, normKeyword } from '../lib/api.js';
import { settle, useDfs } from '../lib/useDfs.js';
import { Card, DataTable, Empty, ErrorBox, ExtLink, Intent, Kd, Kpi, KpiRow, Loading, Pos, ResultMeta, Segmented } from '../components/ui.jsx';

const POS_BUCKETS = [
  ['pos_1', '1'], ['pos_2_3', '2–3'], ['pos_4_10', '4–10'], ['pos_11_20', '11–20'], ['pos_21_30', '21–30'],
  ['pos_31_40', '31–40'], ['pos_41_50', '41–50'], ['pos_51_60', '51–60'], ['pos_61_70', '61–70'],
  ['pos_71_80', '71–80'], ['pos_81_90', '81–90'], ['pos_91_100', '91–100'],
];

export default function DomainOverview() {
  const { domain, location, nav, params } = useApp();
  const [target, setTarget] = useState(params.domain || domain || '');
  const [metric, setMetric] = useState('etv');

  useEffect(() => { if (!params.domain && domain) setTarget(domain); }, [domain]); // eslint-disable-line

  const loader = useCallback(async (force, t) => {
    const base = { target: t, location_code: location.code, language_code: location.lang };
    const [overview, history, ranked] = await settle([
      dfs('dataforseo_labs/google/domain_rank_overview/live', base, { force }),
      dfs('dataforseo_labs/google/historical_rank_overview/live', base, { force }),
      dfs('dataforseo_labs/google/ranked_keywords/live', { ...base, limit: 1000, order_by: ['ranked_serp_element.serp_item.etv,desc'] }, { force }),
    ]);
    if (overview.error && ranked.error) throw new Error(overview.error);
    const org = overview.result?.[0]?.items?.[0]?.metrics?.organic || {};
    const hist = (history.result?.[0]?.items || [])
      .map((i) => ({ label: `${String(i.month).padStart(2, '0')}/${String(i.year).slice(2)}`, sortKey: i.year * 100 + i.month, etv: Math.round(i.metrics?.organic?.etv || 0), count: i.metrics?.organic?.count || 0, top10: (i.metrics?.organic?.pos_1 || 0) + (i.metrics?.organic?.pos_2_3 || 0) + (i.metrics?.organic?.pos_4_10 || 0) }))
      .sort((a, b) => a.sortKey - b.sortKey);
    const rows = (ranked.result?.[0]?.items || []).map((it) => {
      const k = normKeyword(it);
      const s = it.ranked_serp_element?.serp_item || {};
      return { ...k, pos: s.rank_group ?? null, url: s.url, etv: s.etv ?? 0, type: s.type };
    });
    const dist = POS_BUCKETS.map(([k, label]) => ({ label, n: org[k] || 0 }));
    return {
      data: { org, hist, rows, dist, total: ranked.result?.[0]?.total_count, errors: [history.error, ranked.error].filter(Boolean) },
      metas: [overview, history, ranked].filter((m) => !m.error),
    };
  }, [location]);

  const { loading, error, data, meta, run } = useDfs(loader);
  const go = (force = false) => { const t = cleanDomain(target); if (t) { setTarget(t); run(force, t); } };

  useEffect(() => { if (cleanDomain(target)) go(); }, [location]); // eslint-disable-line

  const top3 = data ? (data.org.pos_1 || 0) + (data.org.pos_2_3 || 0) : 0;
  const top10 = data ? top3 + (data.org.pos_4_10 || 0) : 0;

  return (
    <div className="stack">
      <form className="query-bar" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="input" placeholder="Domain, e.g. companimal.co.uk" value={target} onChange={(e) => setTarget(e.target.value)} />
        <button className="btn btn-primary" disabled={loading}>Analyse</button>
        <ResultMeta meta={meta} loading={loading} onRefresh={() => go(true)} />
      </form>

      <ErrorBox error={error} />
      {data?.errors?.map((e, i) => <ErrorBox key={i} error={e} />)}
      {loading && <Loading />}
      {!data && !loading && !error && <Empty title="Pick a domain">Choose one from the sidebar or type it above, then hit Analyse.</Empty>}

      {data && (
        <>
          <KpiRow>
            <Kpi label="Ranking keywords" value={fmt(data.org.count)} sub={data.org.is_new ? `+${fmt(data.org.is_new)} new · −${fmt(data.org.is_lost)} lost` : null} />
            <Kpi label="Est. monthly traffic" value={fmtCompact(data.org.etv)} sub="ETV" />
            <Kpi label="Traffic value" value={'$' + fmtCompact(data.org.estimated_paid_traffic_cost)} sub="equiv. paid cost" />
            <Kpi label="Top 3" value={fmt(top3)} tone="good" />
            <Kpi label="Top 10" value={fmt(top10)} />
          </KpiRow>

          <div className="grid-2">
            <Card title="Trend" actions={<Segmented value={metric} onChange={setMetric} options={[{ value: 'etv', label: 'Traffic' }, { value: 'count', label: 'Keywords' }, { value: 'top10', label: 'Top 10' }]} />}>
              {data.hist.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={data.hist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={44} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Area type="monotone" dataKey={metric} stroke="#2563eb" strokeWidth={2} fill="url(#g1)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Empty title="No history returned" />}
            </Card>
            <Card title="Position distribution">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.dist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#eef0f3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={44} />
                  <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: '#f3f4f6' }} />
                  <Bar dataKey="n" radius={[4, 4, 0, 0]}>
                    {data.dist.map((d, i) => <Cell key={i} fill={i < 2 ? '#0d9488' : i < 3 ? '#2563eb' : i < 4 ? '#93c5fd' : '#cbd5e1'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title={`Ranked keywords${data.total ? ` · top ${fmt(data.rows.length)} of ${fmt(data.total)} by traffic` : ''}`} pad={false}>
            <DataTable
              exportName={`ranked_${target}_${location.flag}`}
              rows={data.rows}
              initialSort={{ key: 'etv', dir: 'desc' }}
              onRowClick={(r) => nav('serp', { keyword: r.keyword, highlight: target })}
              columns={[
                { key: 'keyword', label: 'Keyword', className: 'kw' },
                { key: 'pos', label: 'Pos', num: true, render: (r) => <Pos n={r.pos} /> },
                { key: 'volume', label: 'Volume', num: true, render: (r) => fmt(r.volume) },
                { key: 'etv', label: 'Traffic', num: true, render: (r) => fmt(r.etv, 0) },
                { key: 'kd', label: 'KD', num: true, render: (r) => <Kd n={r.kd} /> },
                { key: 'intent', label: 'Intent', render: (r) => <Intent v={r.intent} /> },
                { key: 'cpc', label: 'CPC', num: true, render: (r) => (r.cpc ? '$' + r.cpc.toFixed(2) : '–') },
                { key: 'url', label: 'URL', className: 'url', render: (r) => <ExtLink href={r.url}>{r.url?.replace(/^https?:\/\/[^/]+/, '') || '/'}</ExtLink> },
              ]}
            />
          </Card>
          <p className="hint">Click a keyword row to open its live SERP.</p>
        </>
      )}
    </div>
  );
}
