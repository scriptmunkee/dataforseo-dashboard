import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { LOCATIONS, cleanDomain, fmtMoney, getJson } from './lib/api.js';
import DomainOverview from './views/DomainOverview.jsx';
import Keywords from './views/Keywords.jsx';
import Competitors from './views/Competitors.jsx';
import Backlinks from './views/Backlinks.jsx';
import Serp from './views/Serp.jsx';
import AiVisibility from './views/AiVisibility.jsx';
import Usage from './views/Usage.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const VIEWS = [
  { id: 'overview', label: 'Domain overview', icon: '◎', C: DomainOverview },
  { id: 'keywords', label: 'Keyword research', icon: '⌕', C: Keywords },
  { id: 'competitors', label: 'Competitors & gap', icon: '⇄', C: Competitors },
  { id: 'backlinks', label: 'Backlinks', icon: '⛓', C: Backlinks },
  { id: 'serp', label: 'SERP viewer', icon: '☰', C: Serp },
  { id: 'ai', label: 'AI visibility', icon: '✦', C: AiVisibility },
  { id: 'usage', label: 'Usage & cache', icon: '$', C: Usage },
];

function readPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writePref(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

export default function App() {
  const [view, setView] = useState(() => readPref('view', 'overview'));
  const [params, setParams] = useState({});
  const [location, setLocationState] = useState(() => readPref('location', LOCATIONS[0]));
  const [domain, setDomainState] = useState(() => readPref('domain', ''));
  const [domains, setDomains] = useState([]);
  const [spend, setSpend] = useState({ today: 0, balance: null, last: null });
  const [health, setHealth] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');

  const setLocation = (l) => { setLocationState(l); writePref('location', l); };
  const setDomain = (d) => { setDomainState(d); writePref('domain', d); };

  const nav = useCallback((id, p = {}) => {
    setView(id); writePref('view', id); setParams({ ...p, _t: Date.now() });
    window.scrollTo({ top: 0 });
  }, []);

  const refreshSpend = useCallback(async () => {
    try {
      const c = await getJson('/api/costs');
      setSpend((s) => ({ ...s, today: c.today }));
    } catch { /* ignore */ }
    try {
      const b = await getJson('/api/balance');
      setSpend((s) => ({ ...s, balance: b.balance }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    getJson('/api/health').then(setHealth).catch(() => setHealth({ ok: false }));
    getJson('/api/domains').then((d) => {
      setDomains(d);
      if (!readPref('domain', '') && d[0]) setDomain(d[0].domain);
    }).catch(() => {});
    refreshSpend();
    const onCall = (e) => {
      setSpend((s) => ({ ...s, last: e.detail }));
      if (!e.detail.cached) refreshSpend();
    };
    window.addEventListener('dfs:call', onCall);
    return () => window.removeEventListener('dfs:call', onCall);
  }, [refreshSpend]);

  const saveDomains = async (list) => {
    setDomains(list);
    try { await getJson('/api/domains', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(list) }); } catch { /* ignore */ }
  };

  const addDomain = () => {
    const d = cleanDomain(newDomain);
    if (!d || domains.some((x) => x.domain === d)) return;
    saveDomains([...domains, { domain: d, label: d }]);
    setNewDomain(''); setAddOpen(false); setDomain(d);
  };

  const Current = VIEWS.find((v) => v.id === view) || VIEWS[0];
  const ctx = { location, setLocation, domain, setDomain, domains, nav, params };

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">D4</div>
            <div>
              <div className="brand-name">SEO Data Desk</div>
              <div className="brand-sub">DataForSEO, locally</div>
            </div>
          </div>
          <nav className="nav">
            {VIEWS.map((v) => (
              <button key={v.id} className={`nav-item ${v.id === view ? 'active' : ''}`} onClick={() => nav(v.id)}>
                <span className="nav-icon">{v.icon}</span>{v.label}
              </button>
            ))}
          </nav>
          <div className="side-section">
            <div className="side-title">
              Saved domains
              <button className="icon-btn" onClick={() => setAddOpen((o) => !o)} title="Add domain">+</button>
            </div>
            {addOpen && (
              <form className="add-domain" onSubmit={(e) => { e.preventDefault(); addDomain(); }}>
                <input className="input input-sm" autoFocus placeholder="example.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
              </form>
            )}
            <div className="domain-list">
              {domains.map((d) => (
                <div key={d.domain} className={`domain-item ${d.domain === domain ? 'active' : ''}`}>
                  <button className="domain-btn" onClick={() => setDomain(d.domain)} title={d.domain}>
                    <span className="domain-label">{d.label}</span>
                    {d.label !== d.domain && <span className="domain-sub">{d.domain}</span>}
                  </button>
                  <button className="icon-btn remove" title="Remove" onClick={() => saveDomains(domains.filter((x) => x.domain !== d.domain))}>×</button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <h1>{Current.label}</h1>
            <div className="spacer" />
            <label className="loc">
              <span className="muted small">Market</span>
              <select className="input input-sm" value={location.code} onChange={(e) => setLocation(LOCATIONS.find((l) => l.code === Number(e.target.value)))}>
                {LOCATIONS.map((l) => <option key={l.code} value={l.code}>{l.flag} · {l.name}</option>)}
              </select>
            </label>
            <div className="spend" title="Spend recorded by this dashboard today, and your DataForSEO balance">
              <div><span className="muted small">Today</span><strong>{fmtMoney(spend.today, 3)}</strong></div>
              <div><span className="muted small">Balance</span><strong>{spend.balance === null ? '–' : fmtMoney(spend.balance, 2)}</strong></div>
            </div>
          </header>
          {health && !health.credentials && (
            <div className="error-box setup">
              <strong>Add your DataForSEO credentials.</strong> Copy <code>.env.example</code> to <code>.env</code>, fill in your API login and password, then restart <code>npm run dev</code>.
            </div>
          )}
          <div className="content">
            <Current.C key={view} />
          </div>
        </main>
      </div>
    </Ctx.Provider>
  );
}
