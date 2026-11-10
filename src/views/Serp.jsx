import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { cleanDomain, dfs, fmt } from '../lib/api.js';
import { useDfs } from '../lib/useDfs.js';
import { Card, DataTable, Empty, ErrorBox, ExtLink, Loading, Pos, ResultMeta, Segmented } from '../components/ui.jsx';

const FEATURE_LABELS = {
  ai_overview: 'AI Overview', featured_snippet: 'Featured snippet', people_also_ask: 'People also ask', local_pack: 'Local pack',
  map: 'Map', images: 'Images', video: 'Videos', top_stories: 'Top stories', knowledge_graph: 'Knowledge panel',
  related_searches: 'Related searches', shopping: 'Shopping', paid: 'Ads', hotels_pack: 'Hotels pack', discussions_and_forums: 'Forums',
  perspectives: 'Perspectives', short_videos: 'Short videos', twitter: 'X posts', carousel: 'Carousel', people_also_search: 'People also search',
};

function collectRefs(aio) {
  const refs = [...(aio.references || [])];
  (aio.items || []).forEach((el) => (el.references || []).forEach((r) => refs.push(r)));
  const seen = new Set();
  return refs.filter((r) => r.url && !seen.has(r.url) && seen.add(r.url));
}

export default function Serp() {
  const { location, params, domain } = useApp();
  const [keyword, setKeyword] = useState(params.keyword || '');
  const [device, setDevice] = useState('desktop');
  const [asyncAio, setAsyncAio] = useState(false);
  const [highlight, setHighlight] = useState(params.highlight || domain || '');

  const loader = useCallback(async (force, kw, dev, aio) => {
    const r = await dfs('serp/google/organic/live/advanced', {
      keyword: kw, location_code: location.code, language_code: location.lang, device: dev, depth: 100,
      ...(aio ? { load_async_ai_overview: true } : {}),
    }, { force });
    const res = r.result?.[0] || {};
    const items = res.items || [];
    const organic = items.filter((i) => i.type === 'organic').map((i) => ({
      pos: i.rank_group, abs: i.rank_absolute, domain: i.domain, url: i.url, title: i.title, description: i.description,
    }));
    const aioItem = items.find((i) => i.type === 'ai_overview');
    const aioText = aioItem ? (aioItem.items || []).map((e) => e.text).filter(Boolean).join('\n\n') : '';
    const aioRefs = aioItem ? collectRefs(aioItem).map((x, idx) => ({ n: idx + 1, domain: x.domain, url: x.url, title: x.title, source: x.source })) : [];
    const paa = items.filter((i) => i.type === 'people_also_ask').flatMap((i) => (i.items || []).map((q) => q.title)).filter(Boolean);
    const related = items.filter((i) => i.type === 'related_searches').flatMap((i) => i.items || []).filter((x) => typeof x === 'string');
    const featured = items.find((i) => i.type === 'featured_snippet');
    const types = res.item_types || [...new Set(items.map((i) => i.type))];
    return {
      data: { organic, aioText, aioRefs, hasAio: !!aioItem, paa, related, featured, types, resultsCount: res.se_results_count, checkUrl: res.check_url },
      metas: [r],
    };
  }, [location]);

  const { loading, error, data, meta, run } = useDfs(loader);
  const go = (force = false, kw = keyword) => { const k = kw.trim(); if (k) run(force, k, device, asyncAio); };

  useEffect(() => {
    if (params.keyword) { setKeyword(params.keyword); if (params.highlight) setHighlight(params.highlight); go(false, params.keyword); }
  }, [params._t]); // eslint-disable-line

  const hl = cleanDomain(highlight);
  const isMine = (d) => hl && d && (d === hl || d.endsWith('.' + hl));
  const myBest = useMemo(() => data?.organic.find((o) => isMine(o.domain)), [data, hl]); // eslint-disable-line
  const myAio = useMemo(() => data?.aioRefs.filter((r) => isMine(r.domain)) || [], [data, hl]); // eslint-disable-line

  return (
    <div className="stack">
      <form className="query-bar" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input className="input" placeholder="Keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <Segmented value={device} onChange={setDevice} options={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }]} />
        <label className="check" title="Asks Google to load AI Overviews that render after page load. Costs extra.">
          <input type="checkbox" checked={asyncAio} onChange={(e) => setAsyncAio(e.target.checked)} /> Load AI Overview
        </label>
        <button className="btn btn-primary" disabled={loading}>Get SERP</button>
        <ResultMeta meta={meta} loading={loading} onRefresh={() => go(true)} />
      </form>
      <div className="query-bar flat">
        <span className="muted small">Highlight domain</span>
        <input className="input input-sm w-220" value={highlight} onChange={(e) => setHighlight(e.target.value)} placeholder="yourdomain.com" />
        {data && hl && (
          <span className="small">
            {myBest ? <>Ranks <Pos n={myBest.pos} /> organically</> : <span className="muted">Not in top 100</span>}
            {data.hasAio && <> · {myAio.length ? <strong className="good">cited in AI Overview ({myAio.length})</strong> : <span className="muted">not cited in AI Overview</span>}</>}
          </span>
        )}
      </div>

      <ErrorBox error={error} />
      {loading && <Loading label="Fetching live SERP" />}
      {!data && !loading && !error && <Empty title="Look at a live SERP">Top 100 organic results, SERP features and AI Overview sources. Cached for 24 hours.</Empty>}

      {data && (
        <>
          <Card title="SERP features">
            <div className="chips">
              {data.types.map((t) => <span key={t} className={`chip ${t === 'ai_overview' ? 'chip-accent' : ''}`}>{FEATURE_LABELS[t] || t.replace(/_/g, ' ')}</span>)}
            </div>
            {data.checkUrl && <p className="small muted mt-8"><ExtLink href={data.checkUrl}>Open this SERP in Google</ExtLink></p>}
          </Card>

          {data.hasAio && (
            <div className="grid-2">
              <Card title="AI Overview">
                {data.aioText ? <div className="aio-text">{data.aioText}</div> : <p className="muted small">The overview text was not returned. Tick “Load AI Overview” and refresh to fetch it.</p>}
              </Card>
              <Card title={`AI Overview sources · ${data.aioRefs.length}`} pad={false}>
                <DataTable
                  exportName={`aio_sources_${keyword}`}
                  rows={data.aioRefs}
                  pageSize={20}
                  columns={[
                    { key: 'n', label: '#', num: true },
                    { key: 'domain', label: 'Domain', render: (r) => <span className={isMine(r.domain) ? 'mine' : ''}>{r.domain}</span> },
                    { key: 'title', label: 'Title', className: 'url', render: (r) => <ExtLink href={r.url}>{r.title || r.url}</ExtLink> },
                  ]}
                />
              </Card>
            </div>
          )}

          <Card title={`Organic results · ${data.organic.length}`} pad={false}>
            <DataTable
              exportName={`serp_${keyword}_${location.flag}_${device}`}
              rows={data.organic}
              pageSize={100}
              initialSort={{ key: 'pos', dir: 'asc' }}
              columns={[
                { key: 'pos', label: 'Pos', num: true, render: (r) => <Pos n={r.pos} /> },
                { key: 'domain', label: 'Domain', render: (r) => <span className={isMine(r.domain) ? 'mine' : ''}>{r.domain}</span> },
                { key: 'title', label: 'Title', className: 'url', render: (r) => <div><ExtLink href={r.url}>{r.title}</ExtLink><div className="sub-line">{r.url}</div></div> },
                { key: 'abs', label: 'Abs. pos', num: true },
              ]}
            />
          </Card>

          {(data.paa.length > 0 || data.related.length > 0) && (
            <div className="grid-2">
              {data.paa.length > 0 && (
                <Card title="People also ask">
                  <ul className="plain-list">{data.paa.map((q) => <li key={q}>{q}</li>)}</ul>
                </Card>
              )}
              {data.related.length > 0 && (
                <Card title="Related searches">
                  <div className="chips">{data.related.map((q) => <button key={q} className="chip chip-btn" onClick={() => { setKeyword(q); go(false, q); }}>{q}</button>)}</div>
                </Card>
              )}
            </div>
          )}
          {data.resultsCount ? <p className="hint">About {fmt(data.resultsCount)} results.</p> : null}
        </>
      )}
    </div>
  );
}
