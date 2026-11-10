import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../App.jsx';
import { cleanDomain, dfs, fmt, fmtCompact } from '../lib/api.js';
import { settle, useDfs } from '../lib/useDfs.js';
import { Card, DataTable, Empty, ErrorBox, ExtLink, Kpi, KpiRow, Loading, ResultMeta, Segmented } from '../components/ui.jsx';

// Group elements look like { key, mentions, ai_search_volume }
const firstGroup = (arr) => (Array.isArray(arr) && arr[0]) || {};

export default function AiVisibility() {
  const { domain, location } = useApp();
  const [kind, setKind] = useState('domain');
  const [target, setTarget] = useState(domain || '');
  const [platform, setPlatform] = useState('google');

  useEffect(() => { if (domain && kind === 'domain') setTarget(domain); }, [domain]); // eslint-disable-line

  const loader = useCallback(async (force, k, t, p) => {
    const tgt = k === 'domain' ? [{ domain: t }] : [{ keyword: t, match_type: 'word_match' }];
    const base = { target: tgt, location_code: location.code, language_code: location.lang, platform: p };
    const [agg, pages, domains] = await settle([
      dfs('ai_optimization/llm_mentions/aggregated_metrics/live', base, { force }),
      dfs('ai_optimization/llm_mentions/top_pages/live', { ...base, items_list_limit: 10, internal_list_limit: 10 }, { force }),
      dfs('ai_optimization/llm_mentions/top_domains/live', { ...base, items_list_limit: 10, internal_list_limit: 10 }, { force }),
    ]);
    if (agg.error) throw new Error(agg.error);
    const total = agg.result?.[0]?.items?.[0]?.total || {};
    const head = firstGroup(total.platform);
    const sources = (total.sources_domain || []).map((g) => ({ domain: g.key, mentions: g.mentions, volume: g.ai_search_volume }));
    const pageRows = (pages.result?.[0]?.items?.[0]?.items || []).map((i) => {
      const g = firstGroup(i.platform);
      return { url: i.key, mentions: g.mentions ?? null, volume: g.ai_search_volume ?? null, coSources: (i.sources_domain || []).filter((s) => !s.key.endsWith(t)).slice(0, 3).map((s) => s.key).join(', ') };
    });
    const domRows = (domains.result?.[0]?.items?.[0]?.items || []).map((i) => {
      const g = firstGroup(i.platform);
      return { domain: i.key, mentions: g.mentions ?? null, volume: g.ai_search_volume ?? null };
    });
    return {
      data: { mentions: head.mentions, volume: head.ai_search_volume, sources, pageRows, domRows, errors: [pages.error, domains.error].filter(Boolean) },
      metas: [agg, pages, domains].filter((x) => !x.error),
    };
  }, [location]);

  const { loading, error, data, meta, run } = useDfs(loader);
  const go = (force = false) => {
    const t = kind === 'domain' ? cleanDomain(target) : target.trim();
    if (t) { setTarget(t); run(force, kind, t, platform); }
  };

  const chart = (data?.sources || []).slice(0, 10);
  const t = kind === 'domain' ? cleanDomain(target) : '';

  return (
    <div className="stack">
      <form className="query-bar" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <Segmented value={kind} onChange={setKind} options={[{ value: 'domain', label: 'Domain' }, { value: 'keyword', label: 'Brand / keyword' }]} />
        <input className="input" placeholder={kind === 'domain' ? 'fourseasons.com' : 'four seasons'} value={target} onChange={(e) => setTarget(e.target.value)} />
        <Segmented value={platform} onChange={setPlatform} options={[{ value: 'google', label: 'Google AI' }, { value: 'chat_gpt', label: 'ChatGPT' }]} />
        <button className="btn btn-primary" disabled={loading}>Check</button>
        <ResultMeta meta={meta} loading={loading} onRefresh={() => go(true)} />
      </form>

      <ErrorBox error={error} />
      {data?.errors?.map((e, i) => <ErrorBox key={i} error={e} />)}
      {loading && <Loading label="Counting LLM mentions" />}
      {!data && !loading && !error && <Empty title="How often do AI answers cite you?">Mentions across Google AI Overviews / AI Mode or ChatGPT, with the pages that get cited and who gets cited alongside you.</Empty>}

      {data && (
        <>
          <KpiRow>
            <Kpi label="Mentions" value={fmt(data.mentions)} sub={platform === 'google' ? 'Google AI answers' : 'ChatGPT answers'} />
            <Kpi label="AI search volume" value={fmtCompact(data.volume)} sub="monthly, across those prompts" />
            <Kpi label="Cited pages" value={fmt(data.pageRows.length)} sub="top 10 returned" />
          </KpiRow>

          <div className="grid-2">
            <Card title="Sources cited in the same answers">
              <ResponsiveContainer width="100%" height={Math.max(240, chart.length * 26)}>
                <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#eef0f3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={fmtCompact} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="domain" tick={{ fontSize: 11, fill: '#374151' }} width={170} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: '#f3f4f6' }} />
                  <Bar dataKey="mentions" name="Mentions" radius={[0, 4, 4, 0]}>
                    {chart.map((d) => <Cell key={d.domain} fill={t && d.domain.endsWith(t) ? '#0d9488' : '#93c5fd'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Top cited pages" pad={false}>
              <DataTable
                exportName={`ai_pages_${target}_${platform}`}
                rows={data.pageRows}
                pageSize={10}
                initialSort={{ key: 'mentions', dir: 'desc' }}
                columns={[
                  { key: 'url', label: 'Page', className: 'url', render: (r) => <div><ExtLink href={r.url}>{r.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</ExtLink>{r.coSources && <div className="sub-line">with {r.coSources}</div>}</div> },
                  { key: 'mentions', label: 'Mentions', num: true, render: (r) => fmt(r.mentions) },
                  { key: 'volume', label: 'AI vol.', num: true, render: (r) => fmtCompact(r.volume) },
                ]}
              />
            </Card>
          </div>

          {data.domRows.length > 0 && (
            <Card title="Top domains in these answers" pad={false}>
              <DataTable
                exportName={`ai_domains_${target}_${platform}`}
                rows={data.domRows}
                pageSize={10}
                initialSort={{ key: 'mentions', dir: 'desc' }}
                columns={[
                  { key: 'domain', label: 'Domain' },
                  { key: 'mentions', label: 'Mentions', num: true, render: (r) => fmt(r.mentions) },
                  { key: 'volume', label: 'AI vol.', num: true, render: (r) => fmtCompact(r.volume) },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
