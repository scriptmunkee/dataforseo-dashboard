// Thin client for the local API server
export async function dfs(path, payload, { force = false, ttlHours } = {}) {
  const res = await fetch('/api/dfs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, payload, force, ttlHours }),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  window.dispatchEvent(new CustomEvent('dfs:call', { detail: json }));
  return json; // { cached, fetchedAt, cost, result }
}

export async function getJson(url, opts) {
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export const LOCATIONS = [
  { code: 2826, name: 'United Kingdom', lang: 'en', flag: 'UK' },
  { code: 2840, name: 'United States', lang: 'en', flag: 'US' },
  { code: 2124, name: 'Canada', lang: 'en', flag: 'CA' },
  { code: 2036, name: 'Australia', lang: 'en', flag: 'AU' },
  { code: 2372, name: 'Ireland', lang: 'en', flag: 'IE' },
  { code: 2784, name: 'United Arab Emirates', lang: 'en', flag: 'AE' },
  { code: 2702, name: 'Singapore', lang: 'en', flag: 'SG' },
  { code: 2276, name: 'Germany', lang: 'de', flag: 'DE' },
  { code: 2250, name: 'France', lang: 'fr', flag: 'FR' },
  { code: 2724, name: 'Spain', lang: 'es', flag: 'ES' },
  { code: 2380, name: 'Italy', lang: 'it', flag: 'IT' },
  { code: 2484, name: 'Mexico', lang: 'es', flag: 'MX' },
];

// Formatting
export const fmt = (n, d = 0) =>
  n === null || n === undefined || Number.isNaN(n) ? '–' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const fmtCompact = (n) =>
  n === null || n === undefined ? '–' : Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const fmtMoney = (n, d = 4) => (n === null || n === undefined ? '–' : '$' + Number(n).toFixed(d));
export const fmtDate = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const ago = (t) => {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function cleanDomain(input) {
  return (input || '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
}

export function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[^a-z0-9._-]+/gi, '_') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// Keyword items come in two shapes: flat (ideas/suggestions/overview) or wrapped in keyword_data (related/ranked/intersection)
export function normKeyword(item) {
  const k = item.keyword_data || item;
  const info = k.keyword_info || {};
  return {
    keyword: k.keyword,
    volume: info.search_volume ?? null,
    cpc: info.cpc ?? null,
    competition: info.competition_level ?? null,
    kd: k.keyword_properties?.keyword_difficulty ?? null,
    intent: k.search_intent_info?.main_intent ?? null,
    trend: (info.monthly_searches || []).slice().reverse().map((m) => m.search_volume ?? 0),
  };
}

export const COLORS = ['#2563eb', '#0d9488', '#d97706', '#7c3aed', '#e11d48', '#0891b2', '#65a30d', '#c026d3'];
export const INTENT_COLORS = { informational: '#2563eb', commercial: '#d97706', transactional: '#0d9488', navigational: '#7c3aed' };
