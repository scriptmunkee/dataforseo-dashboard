import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../App.jsx';
import { cleanDomain, dfs, fmt, fmtCompact, normKeyword } from '../lib/api.js';
import { useDfs } from '../lib/useDfs.js';
import { Card, DataTable, Empty, ErrorBox, ExtLink, Intent, Kd, Loading, Pos, ResultMeta, Segmented } from '../components/ui.jsx';

export default function Competitors() {
  const { domain, location, nav } = useApp();
  const [you, setYou] = useState(domain || '');
  const [rival, setRival] = useState('');
  const [gapMode, setGapMode] = useState('missing');

  useEffect(() => { if (domain) setYou(domain); }, [domain]);

  // Competitor list
  const compLoader = useCallback(async (force, t) => {
    const r = await dfs('dataforseo_labs/google/competitors_domain/live', {
      target: t, location_code: location.code, language_code: location.lang, limit: 30, exclude_top_domains: true,
      order_by: ['intersections,desc'],
    }, { force });
    const rows = (r.result?.[0]?.items || [])
      .filter((i) => i.domain !== t && i.domain !== 'www.' + t)
      .map((i) => ({
        domain: i.domain,
        shared: i.intersections,
        avgPos: i.avg_position ? Math.round(i.avg_position * 10) / 10 : null,
        etv: Math.round(i.full_domain_metrics?.organic?.etv || 0),
        keywords: i.full_domain_metrics?.organic?.count || 0,
        sharedEtv: Math.round(i.metrics?.organic?.etv || 0),
      }));
    return { data: rows, metas: [r] };
  }, [location]);
  const comp = useDfs(compLoader);

  // Keyword gap
  const gapLoader = useCallback(async (force, a, b, mode) => {
    const r = await dfs('dataforseo_labs/google/domain_intersection/live', {
      target1: b, target2: a, intersections: mode === 'shared',
      location_code: location.code, language_code: location.lang, limit: 1000,
      order_by: ['keyword_data.keyword_info.search_volume,desc'],
    }, { force });
    const rows = (r.result?.[0]?.items || []).map((it) => ({
      ...normKeyword(it),
      theirPos: it.first_domain_serp_element?.rank_group ?? null,
      theirUrl: it.first_domain_serp_element?.url,
      yourPos: it.second_domain_serp_element?.rank_group ?? null,
      yourUrl: it.second_domain_serp_element?.url,
    }));
    return { data: { rows, total: r.result?.[0]?.total_count }, metas: [r] };
  }, [location]);
  const gap = useDfs(gapLoader);

  const runComp = (force = false) => { const t = cleanDomain(you); if (t) { setYou(t); comp.run(force, t); } };
  const runGap = (force = false, r = rival, m = gapMode) => {
    const a = cleanDomain(you); const b = cleanDomain(r);
    if (a && b) gap.run(force, a, b, m);
  };

  useEffect(() => { if (cleanDomain(you)) runComp(); }, [location]); // eslint-disable-line

  const pickRival = (d) => { setRival(d); runGap(false, d); };
  const chart = (comp.data || []).slice(0, 12);

  return (
    <div className="stack">
      <form className="query-bar" onSubmit={(e) => { e.preventDefault(); runComp(); }}>
        <input className="input" placeholder="Your domain" value={you} onChange={(e) => setYou(e.target.value)} />
        <button className="btn btn-primary" disabled={comp.loading}>Find competitors</button>
        <ResultMeta meta={comp.meta} loading={comp.loading} onRefresh={() => runComp(true)} />
      </form>
      <ErrorBox error={comp.error} />
      {comp.loading && <Loading label="Finding competitors" />}
      {!comp.data && !comp.loading && !comp.error && <Empty title="Who do you compete with in search?">Enter your domain to see who shares the most keywords with it.</Empty>}

      {comp.data && (
        <div className="grid-2">
          <Card title="Shared keywords">
            <ResponsiveContainer width="100%" height={Math.max(220, chart.length * 26)}>
              <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#eef0f3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={fmtCompact} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="domain" tick={{ fontSize: 11, fill: '#374151' }} width={160} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="shared" name="Shared keywords" fill="#2563eb" radius={[0, 4, 4, 0]} onClick={(d) => pickRival(d.domain)} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Competitors" pad={false}>
            <DataTable
              exportName={`competitors_${you}_${location.flag}`}
              rows={comp.data}
              pageSize={15}
              initialSort={{ key: 'shared', dir: 'desc' }}
              onRowClick={(r) => pickRival(r.domain)}
              columns={[
                { key: 'domain', label: 'Domain', className: 'kw' },
                { key: 'shared', label: 'Shared', num: true, render: (r) => fmt(r.shared) },
                { key: 'avgPos', label: 'Avg pos', num: true },
                { key: 'keywords', label: 'Keywords', num: true, render: (r) => fmtCompact(r.keywords) },
                { key: 'etv', label: 'Traffic', num: true, render: (r) => fmtCompact(r.etv) },
              ]}
            />
          </Card>
        </div>
      )}

      <Card title="Keyword gap" actions={<ResultMeta meta={gap.meta} loading={gap.loading} onRefresh={() => runGap(true)} />}>
        <form className="query-bar flat" onSubmit={(e) => { e.preventDefault(); runGap(); }}>
          <input className="input" placeholder="Competitor domain (or click one above)" value={rival} onChange={(e) => setRival(e.target.value)} />
          <Segmented value={gapMode} onChange={(m) => { setGapMode(m); if (rival) runGap(false, rival, m); }} options={[{ value: 'missing', label: 'They rank, you don’t' }, { value: 'shared', label: 'Both rank' }]} />
          <button className="btn btn-primary" disabled={gap.loading}>Compare</button>
        </form>
        <ErrorBox error={gap.error} />
        {gap.loading && <Loading label="Comparing keywords" />}
      </Card>

      {gap.data && (
        <Card title={`${gapMode === 'missing' ? 'Missing' : 'Shared'} keywords · ${fmt(gap.data.rows.length)}${gap.data.total ? ` of ${fmt(gap.data.total)}` : ''}`} pad={false}>
          <DataTable
            exportName={`gap_${gapMode}_${you}_vs_${rival}_${location.flag}`}
            rows={gap.data.rows}
            initialSort={{ key: 'volume', dir: 'desc' }}
            onRowClick={(r) => nav('serp', { keyword: r.keyword, highlight: you })}
            columns={[
              { key: 'keyword', label: 'Keyword', className: 'kw' },
              { key: 'volume', label: 'Volume', num: true, render: (r) => fmt(r.volume) },
              { key: 'kd', label: 'KD', num: true, render: (r) => <Kd n={r.kd} /> },
              { key: 'intent', label: 'Intent', render: (r) => <Intent v={r.intent} /> },
              { key: 'theirPos', label: 'Their pos', num: true, render: (r) => <Pos n={r.theirPos} /> },
              ...(gapMode === 'shared' ? [{ key: 'yourPos', label: 'Your pos', num: true, render: (r) => <Pos n={r.yourPos} /> }] : []),
              { key: 'theirUrl', label: 'Their URL', className: 'url', render: (r) => <ExtLink href={r.theirUrl}>{r.theirUrl?.replace(/^https?:\/\/[^/]+/, '') || '/'}</ExtLink> },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
