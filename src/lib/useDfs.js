import { useCallback, useState } from 'react';

// Wraps a loader that runs one or more dfs() calls.
// loader(force) must return { data, metas: [{cached, fetchedAt, cost}] }
export function useDfs(loader) {
  const [state, setState] = useState({ loading: false, error: null, data: null, meta: null });

  const run = useCallback(async (force = false, ...args) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data, metas = [] } = await loader(force, ...args);
      const meta = {
        cached: metas.length > 0 && metas.every((m) => m.cached),
        fetchedAt: metas.length ? Math.min(...metas.map((m) => m.fetchedAt)) : null,
        cost: metas.reduce((a, m) => a + (m.cost || 0), 0),
      };
      setState({ loading: false, error: null, data, meta });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, [loader]);

  return { ...state, run };
}

// Run several dfs calls, keep going if an optional one fails
export async function settle(promises) {
  const out = await Promise.allSettled(promises);
  return out.map((r) => (r.status === 'fulfilled' ? r.value : { error: r.reason?.message || String(r.reason), result: [] }));
}
