import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache');
const DATA_DIR = path.join(ROOT, 'data');
const COST_LOG = path.join(CACHE_DIR, '_costlog.jsonl');
const DOMAINS_FILE = path.join(DATA_DIR, 'domains.json');
const PORT = Number(process.env.PORT || 8787);
const API_BASE = process.env.DATAFORSEO_BASE || 'https://api.dataforseo.com/v3/';

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const LOGIN = process.env.DATAFORSEO_LOGIN;
const PASSWORD = process.env.DATAFORSEO_PASSWORD;
const AUTH = LOGIN && PASSWORD ? 'Basic ' + Buffer.from(`${LOGIN}:${PASSWORD}`).toString('base64') : null;

// Only these API families can be called through the proxy
const ALLOWED_PREFIXES = ['dataforseo_labs/', 'backlinks/', 'serp/', 'ai_optimization/', 'keywords_data/', 'on_page/'];

// Default cache lifetime per family (hours)
function defaultTtl(p) {
  if (p.startsWith('serp/')) return 24;
  if (p.startsWith('backlinks/')) return 72;
  if (p.startsWith('ai_optimization/')) return 72;
  return 168; // Labs data refreshes roughly monthly, a week is safe
}

const app = express();
app.use(express.json({ limit: '2mb' }));

function cacheKey(p, payload) {
  return crypto.createHash('sha256').update(p + '|' + JSON.stringify(payload)).digest('hex').slice(0, 32);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function logCost(entry) {
  fs.appendFileSync(COST_LOG, JSON.stringify(entry) + '\n');
}

function readCostLog() {
  if (!fs.existsSync(COST_LOG)) return [];
  return fs.readFileSync(COST_LOG, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

async function callDfs(p, body, method = 'POST') {
  if (!AUTH) {
    const err = new Error('No DataForSEO credentials. Copy .env.example to .env and add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD, then restart.');
    err.status = 500;
    throw err;
  }
  const res = await fetch(API_BASE + p, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify([body]) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!json) {
    const err = new Error(`DataForSEO returned HTTP ${res.status} with no JSON body`);
    err.status = 502;
    throw err;
  }
  if (json.status_code !== 20000) {
    const err = new Error(`DataForSEO: ${json.status_message} (${json.status_code})`);
    err.status = 502;
    throw err;
  }
  const task = json.tasks?.[0];
  if (task && task.status_code !== 20000) {
    const err = new Error(`DataForSEO: ${task.status_message} (${task.status_code})`);
    err.status = 502;
    err.cost = json.cost || 0;
    throw err;
  }
  return json;
}

// Main proxy: POST /api/dfs { path, payload, ttlHours?, force? }
app.post('/api/dfs', async (req, res) => {
  const { path: p, payload = {}, ttlHours, force = false } = req.body || {};
  if (!p || typeof p !== 'string' || !ALLOWED_PREFIXES.some((x) => p.startsWith(x)) || p.includes('..')) {
    return res.status(400).json({ error: 'Path not allowed: ' + p });
  }
  const key = cacheKey(p, payload);
  const file = path.join(CACHE_DIR, key + '.json');
  const ttl = (ttlHours ?? defaultTtl(p)) * 3600 * 1000;

  if (!force && fs.existsSync(file)) {
    const hit = readJson(file, null);
    if (hit && Date.now() - hit.fetchedAt < ttl) {
      return res.json({ cached: true, fetchedAt: hit.fetchedAt, cost: 0, originalCost: hit.cost, result: hit.result });
    }
  }

  try {
    const json = await callDfs(p, payload);
    const result = json.tasks?.[0]?.result ?? [];
    const cost = json.cost || 0;
    const entry = { fetchedAt: Date.now(), path: p, payload, cost, result };
    fs.writeFileSync(file, JSON.stringify(entry));
    logCost({ t: entry.fetchedAt, path: p, cost, key });
    res.json({ cached: false, fetchedAt: entry.fetchedAt, cost, result });
  } catch (e) {
    if (e.cost) logCost({ t: Date.now(), path: p, cost: e.cost, error: true });
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Account balance, cached for 5 minutes
let balanceCache = null;
app.get('/api/balance', async (_req, res) => {
  try {
    if (!balanceCache || Date.now() - balanceCache.t > 5 * 60 * 1000) {
      const json = await callDfs('appendix/user_data', null, 'GET');
      const r = json.tasks?.[0]?.result?.[0];
      balanceCache = { t: Date.now(), balance: r?.money?.balance ?? null, login: r?.login };
    }
    res.json(balanceCache);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Spend summary
app.get('/api/costs', (_req, res) => {
  const log = readCostLog();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const start30 = Date.now() - 30 * 86400000;
  const sum = (arr) => arr.reduce((a, b) => a + (b.cost || 0), 0);
  const byDay = {};
  for (const e of log.filter((x) => x.t >= start30)) {
    const d = new Date(e.t).toISOString().slice(0, 10);
    byDay[d] = (byDay[d] || 0) + (e.cost || 0);
  }
  const byPath = {};
  for (const e of log) byPath[e.path] = (byPath[e.path] || 0) + (e.cost || 0);
  res.json({
    today: sum(log.filter((x) => x.t >= startOfDay.getTime())),
    last30: sum(log.filter((x) => x.t >= start30)),
    allTime: sum(log),
    calls: log.length,
    byDay: Object.entries(byDay).sort().map(([date, cost]) => ({ date, cost })),
    byPath: Object.entries(byPath).map(([path, cost]) => ({ path, cost })).sort((a, b) => b.cost - a.cost),
    recent: log.slice(-25).reverse(),
  });
});

// Cache listing and clearing
app.get('/api/cache', (_req, res) => {
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  const items = files.map((f) => {
    const full = path.join(CACHE_DIR, f);
    const j = readJson(full, null);
    return j && { key: f.replace('.json', ''), path: j.path, payload: j.payload, fetchedAt: j.fetchedAt, cost: j.cost, bytes: fs.statSync(full).size };
  }).filter(Boolean).sort((a, b) => b.fetchedAt - a.fetchedAt);
  res.json({ count: items.length, bytes: items.reduce((a, b) => a + b.bytes, 0), items });
});

app.delete('/api/cache/:key?', (req, res) => {
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  let removed = 0;
  for (const f of files) {
    if (!req.params.key || f === req.params.key + '.json') { fs.unlinkSync(path.join(CACHE_DIR, f)); removed++; }
  }
  res.json({ removed });
});

// Saved domains
const DEFAULT_DOMAINS = [
  { domain: 'fourseasons.com', label: 'Four Seasons' },
  { domain: 'companimal.co.uk', label: 'Companimal' },
  { domain: 'christopher-kelly.co.uk', label: 'Christopher Kelly' },
  { domain: 'ascenddigitalmarketing.co.uk', label: 'Ascend Digital' },
  { domain: 'perfectlyplastered.uk', label: 'Perfectly Plastered' },
];
app.get('/api/domains', (_req, res) => res.json(readJson(DOMAINS_FILE, DEFAULT_DOMAINS)));
app.put('/api/domains', (req, res) => {
  const list = Array.isArray(req.body) ? req.body.filter((d) => d && d.domain) : [];
  fs.writeFileSync(DOMAINS_FILE, JSON.stringify(list, null, 2));
  res.json(list);
});

app.get('/api/health', (_req, res) => res.json({ ok: true, credentials: !!AUTH }));

// Serve the built UI when running `npm start`
const DIST = path.join(ROOT, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`DataForSEO dashboard API on http://localhost:${PORT}${AUTH ? '' : '  (no credentials set, see .env.example)'}`);
});
