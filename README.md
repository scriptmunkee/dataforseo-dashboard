# SEO Data Desk

A local dashboard for the DataForSEO API. Charts and tables for the lookups that are quicker to see than to ask for.

## Run it

```bash
cp .env.example .env      # then add your DataForSEO API login and password
npm install
npm run dev               # opens http://localhost:5173
```

`npm start` builds the UI and serves everything from http://localhost:8787 instead.

## Views

| View | What it shows | Endpoints |
|---|---|---|
| Domain overview | KPIs, traffic and keyword trend, position distribution, ranked keywords | `domain_rank_overview`, `historical_rank_overview`, `ranked_keywords` |
| Keyword research | Ideas, suggestions, related or a pasted list; KD vs volume scatter, intent mix, 12 month sparklines | `keyword_ideas`, `keyword_suggestions`, `related_keywords`, `keyword_overview` |
| Competitors & gap | Who shares your keywords; keywords they rank for and you don't, or shared ones | `competitors_domain`, `domain_intersection` |
| Backlinks | Summary, 12 month referring domain trend, new vs lost, page-level links with target status (403, 410 etc.) | `backlinks/summary`, `timeseries_summary`, `timeseries_new_lost_summary`, `backlinks/backlinks` |
| SERP viewer | Top 100, SERP features, AI Overview text and sources, PAA, related searches, your domain highlighted | `serp/google/organic/live/advanced` |
| AI visibility | LLM mentions for a domain or brand on Google AI or ChatGPT, top cited pages, co-cited domains | `ai_optimization/llm_mentions/*` |
| Usage & cache | Spend today, 30 days, by endpoint; every cached response with a delete button | local |

Click any keyword row to open its live SERP. Every table filters, sorts and exports to CSV.

## Caching

Every response is saved to `.cache/` keyed by endpoint plus the exact request. Re-running the same query is free until it expires:

| Family | Kept for |
|---|---|
| Labs (keywords, domains, competitors) | 7 days |
| Backlinks, AI visibility | 3 days |
| SERP | 24 hours |

The badge on each result says whether it came from cache or cost credits. **Refresh** ignores the cache. Spend is logged to `.cache/_costlog.jsonl`.

## Files

- `server/index.js` holds the API proxy, cache, cost log and saved domains (`data/domains.json`)
- `src/views/` has one file per view
- Credentials stay in `.env` on the server side and never reach the browser
