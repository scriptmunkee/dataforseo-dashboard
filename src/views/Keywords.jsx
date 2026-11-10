import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { useApp } from '../App.jsx';
import { INTENT_COLORS, dfs, fmt, fmtCompact, normKeyword } from '../lib/api.js';
import { useDfs } from '../lib/useDfs.js';
import { Card, DataTable, Empty, ErrorBox, Intent, Kd, Kpi, KpiRow, Loading, ResultMeta, Segmented, Sparkline } from '../components/ui.jsx';

const MODES = [
  { value: 'ideas', label: 'Ideas', hint: 'Broad ideas from one or more seeds (one per line)' },
  { value: 'suggestions', label: 'Suggestions', hint: 'Long-tail phrases containing the seed' },
  { value: 'related', label: 'Related', hint: '"Searches related to" expansion, two levels deep' },
  { value: 'overview', label: 'Check list', hint: 'Metrics for your exact keyword list (up to 700, one per line)' },
];

export default function Keywords() {
  const { location, nav, params } = useApp();
  const [mode, setMode] = useState('ideas');
  const [seeds, setSeeds] = useState(params.keyword || '');
  const [minVol, setMinVol] = useState('');
  const [maxKd, setMaxKd] = useState('');
  const [intent, setIntent] = useState('all');

  const loader = useCallback(async (force, m, list) => {
    const base = { location_code: location.code, language_code: location.lang };
    let path; let payload;
    if (m === 'ideas') { path = 'dataforseo_labs/google/keyword_ideas/live'; payload = { ...base, keywords: list.slice(0, 200), limit: 1000, order_by: ['keyword_info.search_volume,desc'] }; }
    if (m === 'suggestions') { path = 'dataforseo_labs/google/keyword_suggestions/live'; payload = { ...base, keyword: list[0], limit: 1000, order_by: ['keyword_info.search_volume,desc'] }; }
    if (m === 'related') { path = 'dataforseo_labs/google/related_keywords/live'; payload = { ...base, keyword: list[0], depth: 2, limit: 1000 }; }
    if (m === 'overview') { path = 'dataforseo_labs/google/keyword_overview/live'; payload = { ...base, keywords: list.slice(0, 700) }; }
    const r = await dfs(path, payload, { force });
    const seen = new Set();
    const rows = (r.result?.[0]?.items || []).map(normKeyword).filter((k) => k.keyword && !seen.has(k.keyword) && seen.add(k.keyword));
    return { data: { rows, total: r.result?.[0]?.total_count }, metas: [r] };
  }, [location]);

  const { loading, error, data, meta, run } = useDfs(loader);
  const parse = () => seeds.split(/\n|,/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const go = (force = false) => { const list = parse(); if (list.length) run(force, mode, list); };

  useEffect(() => { if (params.keyword) go(); }, [params._t]); // eslint-disable-line

  const rows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) =>
      (minVol === '' || (r.volume ?? 0) >= Number(minVol)) &&
      (maxKd === '' || (r.kd ?? 0) <= Number(maxKd)) &&
      (intent === 'all' || r.intent === intent));
  }, [data, minVol, maxKd, intent]);

  const intentMix = useMemo(() => {
    const m = {};
    rows.forEach((r) => { const k = r.intent || 'unknown'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  }, [rows]);

  const scatter = useMemo(() => rows.filter((r) => r.volume && r.kd !== null).slice(0, 400).map((r) => ({ x: r.kd, y: r.volume, z: 1, keyword: r.keyword })), [rows]);
  const totalVol = rows.reduce((a, r) => a + (r.volume || 0), 0);
  const easy = rows.filter((r) => r.kd !== null && r.kd < 30 && (r.volume || 0) >= 50).length;

  return (
    <div className="stack">
      <Card>
        <div className="kw-form">
          <div className="kw-form-left">
            <Segmented value={mode} onChange={setMode} options={MODES} />
            <p className="muted small">{MODES.find((m) => m.value === mode).hint}</p>
            <textarea className="input" rows={mode === 'ideas' || mode === 'overview' ? 4 : 2} placeholder={mode === 'overview' ? 'keyword one\nkeyword two' : 'e.g. luxury hotel maldives'} value={seeds} onChange={(e) => setSeeds(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); }} />
          </div>
          <div className="kw-form-right">
            <button className="btn btn-primary" disabled={loading} onClick={() => go()}>Get keywords</button>
            <span className="muted small">⌘ + Enter</span>
            <ResultMeta meta={meta} loading={loading} onRefresh={() => go(true)} />
          </div>
        </div>
      </Card>

      <ErrorBox error={error} />
      {loading && <Loading />}
      {!data && !loading && !error && <Empty title="Start with a seed keyword">Results are cached for a week, so re-running the same seed costs nothing.</Empty>}

      {data && (
        <>
          <KpiRow>
            <Kpi label="Keywords" value={fmt(rows.length)} sub={data.total ? `of ${fmt(data.total)} available` : null} />
            <Kpi label="Total volume" value={fmtCompact(totalVol)} sub="monthly" />
            <Kpi label="Easy wins" value={fmt(easy)} sub="KD < 30, vol ≥ 50" tone="good" />
          </KpiRow>

          <div className="grid-2">
            <Card title="Difficulty vs volume">
              {scatter.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#eef0f3" />
                    <XAxis type="number" dataKey="x" name="KD" domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }} label={{ value: 'Keyword difficulty', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#6b7280' }} height={34} />
                    <YAxis type="number" dataKey="y" name="Volume" scale="log" domain={['auto', 'auto']} allowDataOverflow tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={fmtCompact} width={44} />
                    <ZAxis type="number" dataKey="z" range={[28, 28]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => payload?.[0] ? (
                      <div className="tt"><strong>{payload[0].payload.keyword}</strong><br />Vol {fmt(payload[0].payload.y)} · KD {payload[0].payload.x}</div>
                    ) : null} />
                    <Scatter data={scatter} fill="#2563eb" fillOpacity={0.55} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : <Empty title="No KD data" />}
            </Card>
            <Card title="Intent mix">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={intentMix} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#eef0f3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#374151' }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip cursor={{ fill: '#f3f4f6' }} />
                  <Bar dataKey="n" radius={[0, 4, 4, 0]}>
                    {intentMix.map((d) => <Cell key={d.name} fill={INTENT_COLORS[d.name] || '#94a3b8'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card pad={false}>
            <DataTable
              exportName={`keywords_${mode}_${parse()[0] || ''}_${location.flag}`}
              rows={rows}
              initialSort={{ key: 'volume', dir: 'desc' }}
              onRowClick={(r) => nav('serp', { keyword: r.keyword })}
              toolbar={(
                <div className="filters">
                  <input className="input input-sm w-90" type="number" placeholder="Min vol" value={minVol} onChange={(e) => setMinVol(e.target.value)} />
                  <input className="input input-sm w-90" type="number" placeholder="Max KD" value={maxKd} onChange={(e) => setMaxKd(e.target.value)} />
                  <select className="input input-sm" value={intent} onChange={(e) => setIntent(e.target.value)}>
                    <option value="all">All intents</option>
                    {Object.keys(INTENT_COLORS).map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              )}
              columns={[
                { key: 'keyword', label: 'Keyword', className: 'kw' },
                { key: 'volume', label: 'Volume', num: true, render: (r) => fmt(r.volume) },
                { key: 'trend', label: '12 mo', sortable: false, csv: (r) => r.trend.join(' '), render: (r) => <Sparkline values={r.trend} /> },
                { key: 'kd', label: 'KD', num: true, render: (r) => <Kd n={r.kd} /> },
                { key: 'intent', label: 'Intent', render: (r) => <Intent v={r.intent} /> },
                { key: 'cpc', label: 'CPC', num: true, render: (r) => (r.cpc ? '$' + r.cpc.toFixed(2) : '–') },
                { key: 'competition', label: 'Comp.', render: (r) => r.competition?.toLowerCase() || '–' },
              ]}
            />
          </Card>
          <p className="hint">Click a keyword row to open its live SERP.</p>
        </>
      )}
    </div>
  );
}
