import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../App.jsx';
import { cleanDomain, dfs, fmt, fmtCompact } from '../lib/api.js';
import { settle, useDfs } from '../lib/useDfs.js';
import { Card, DataTable, Empty, ErrorBox, ExtLink, Kpi, KpiRow, Loading, ResultMeta, Segmented } from '../components/ui.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const shortDate = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : '');

function StatusCode({ code }) {
  if (!code) return <span className="muted">–</span>;
  const tone = code >= 400 ? 'st-bad' : code >= 300 ? 'st-warn' : 'st-ok';
  return <span className={`status ${tone}`}>{code}</span>;
}

export default function Backlinks() {
  const { domain } = useApp();
  const [target, setTarget] = useState(domain || '');
  const [mode, setMode] = useState('one_per_domain');
  const [status, setStatus] = useState('all');

  useEffect(() => { if (domain) setTarget(domain); }, [domain]);

  const loader = useCallback(async (force, t, m) => {
    const to = new Date(); const from = new Date(); from.setFullYear(from.getFullYear() - 1);
    // Round the date range to the month so the cache key stays stable within a month
    const range = { date_from: iso(new Date(from.getFullYear(), from.getMonth(), 1)), date_to: iso(new Date(to.getFullYear(), to.getMonth(), 1)), group_range: 'month' };
    const [summary, series, newLost, links] = await settle([
      dfs('backlinks/summary/live', { target: t, include_subdomains: true, backlinks_status_type: 'live' }, { force }),
      dfs('backlinks/timeseries_summary/live', { target: t, ...range }, { force }),
      dfs('backlinks/timeseries_new_lost_summary/live', { target: t, ...range }, { force }),
      dfs('backlinks/backlinks/live', { target: t, mode: m, limit: 1000, backlinks_status_type: 'all', include_subdomains: true, order_by: ['domain_from_rank,desc'] }, { force }),
    ]);
    if (summary.error && links.error) throw new Error(summary.error);
    const s = summary.result?.[0] || {};
    const trend = (series.result?.[0]?.items || []).map((i) => ({ date: shortDate(i.date), refDomains: i.referring_domains, backlinks: i.backlinks, rank: i.rank }));
    const churn = (newLost.result?.[0]?.items || []).map((i) => ({ date: shortDate(i.date), new: i.new_referring_domains, lost: -(i.lost_referring_domains || 0) }));
    const rows = (links.result?.[0]?.items || []).map((i) => ({
      from: i.url_from, fromDomain: i.domain_from, title: i.page_from_title, anchor: i.anchor || (i.item_type === 'image' ? '[image]' : ''),
      to: i.url_to, toStatus: i.url_to_status_code, dofollow: i.dofollow, rank: i.domain_from_rank,
      firstSeen: i.first_seen?.slice(0, 10), lastSeen: i.last_seen?.slice(0, 10), lost: i.is_lost, broken: i.is_broken,
      state: i.is_lost ? 'lost' : i.is_broken ? 'broken' : 'live',
    }));
    return {
      data: { s, trend, churn, rows, total: links.result?.[0]?.total_count, errors: [series.error, newLost.error, links.error].filter(Boolean) },
      metas: [summary, series, newLost, links].filter((x) => !x.error),
    };
  }, []);

  const { loading, error, data, meta, run } = useDfs(loader);
  const go = (force = false, m = mode) => { const t = cleanDomain(target); if (t) { setTarget(t); run(force, t, m); } };

  const rows = useMemo(() => (data?.rows || []).filter((r) =>
    status === 'all' || r.state === status || (status === '4xx' && r.toStatus >= 400)), [data, status]);

  return (
    <div className="stack">
      <form className="query-bar" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="input" placeholder="Domain or URL" value={target} onChange={(e) => setTarget(e.target.value)} />
        <Segmented value={mode} onChange={(m) => { setMode(m); if (data) go(false, m); }} options={[{ value: 'one_per_domain', label: 'One per domain' }, { value: 'as_is', label: 'All links' }]} />
        <button className="btn btn-primary" disabled={loading}>Get backlinks</button>
        <ResultMeta meta={meta} loading={loading} onRefresh={() => go(true)} />
      </form>

      <ErrorBox error={error} />
      {data?.errors?.map((e, i) => <ErrorBox key={i} error={e} />)}
      {loading && <Loading label="Pulling link data" />}
      {!data && !loading && !error && <Empty title="Check a link profile">Summary, a year of referring domain history and up to 1,000 page-level links. Cached for 3 days.</Empty>}

      {data && (
        <>
          <KpiRow>
            <Kpi label="Domain rank" value={fmt(data.s.rank)} />
            <Kpi label="Referring domains" value={fmtCompact(data.s.referring_domains)} sub={`${fmtCompact(data.s.referring_main_domains)} main`} />
            <Kpi label="Backlinks" value={fmtCompact(data.s.backlinks)} />
            <Kpi label="Broken backlinks" value={fmtCompact(data.s.broken_backlinks)} tone={data.s.broken_backlinks ? 'warn' : null} sub={`${fmt(data.s.broken_pages)} broken pages`} />
            <Kpi label="Spam score" value={fmt(data.s.backlinks_spam_score)} />
          </KpiRow>

          <div className="grid-2">
            <Card title="Referring domains, 12 months">
              {data.trend.length ? (
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={fmtCompact} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Line type="monotone" dataKey="refDomains" name="Referring domains" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <Empty title="No history returned" />}
            </Card>
            <Card title="New vs lost referring domains">
              {data.churn.length ? (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={data.churn} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={fmtCompact} tickLine={false} axisLine={false} width={44} />
                    <Tooltip formatter={(v) => fmt(Math.abs(v))} cursor={{ fill: '#f3f4f6' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="new" name="New" stackId="a" fill="#0d9488" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="lost" name="Lost" stackId="a" fill="#e11d48" radius={[0, 0, 3, 3]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty title="No history returned" />}
            </Card>
          </div>

          <Card title={`Backlinks · ${fmt(data.rows.length)}${data.total ? ` of ${fmt(data.total)}` : ''}`} pad={false}>
            <DataTable
              exportName={`backlinks_${target}_${mode}`}
              rows={rows}
              initialSort={{ key: 'rank', dir: 'desc' }}
              toolbar={(
                <select className="input input-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">All states</option>
                  <option value="live">Live</option>
                  <option value="lost">Lost</option>
                  <option value="broken">Broken</option>
                  <option value="4xx">Target 4xx (403, 404, 410…)</option>
                </select>
              )}
              columns={[
                { key: 'from', label: 'Linking page', className: 'url', render: (r) => <div><ExtLink href={r.from}>{r.fromDomain}</ExtLink><div className="sub-line" title={r.from}>{r.title || r.from}</div></div> },
                { key: 'anchor', label: 'Anchor', className: 'anchor' },
                { key: 'to', label: 'Target URL', className: 'url', render: (r) => <ExtLink href={r.to}>{r.to?.replace(/^https?:\/\/[^/]+/, '') || '/'}</ExtLink> },
                { key: 'toStatus', label: 'Target status', num: true, render: (r) => <StatusCode code={r.toStatus} /> },
                { key: 'dofollow', label: 'Follow', csv: (r) => (r.dofollow ? 'dofollow' : 'nofollow'), render: (r) => (r.dofollow ? <span className="tag tag-good">follow</span> : <span className="tag">nofollow</span>) },
                { key: 'rank', label: 'DR', num: true },
                { key: 'state', label: 'State', render: (r) => <span className={`tag tag-${r.state}`}>{r.state}</span> },
                { key: 'firstSeen', label: 'First seen' },
                { key: 'lastSeen', label: 'Last seen' },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
