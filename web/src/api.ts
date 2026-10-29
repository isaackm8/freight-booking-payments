import { useEffect, useState } from 'react';

export class NotFoundError extends Error {}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (res.status === 404) throw new NotFoundError((await res.json()).error);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

// Fetches JSON from the API and re-fetches whenever the URL changes.
export function useApi<T>(url: string) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    getJson<T>(url, ctrl.signal)
      .then((data) => setState({ data, loading: false }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setState({ error, loading: false });
      });
    return () => ctrl.abort();
  }, [url]);
  return state;
}
