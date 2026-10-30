import { useCallback, useEffect, useState } from 'react';

export class NotFoundError extends Error {}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (res.status === 404) throw new NotFoundError((await res.json()).error);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

// Sends a change to the API; throws with the server's message if it is refused.
export async function send(url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
}

// Fetches JSON from the API and re-fetches whenever the URL changes, or when reload() is called.
// Pass null to fetch nothing (e.g. nothing selected yet).
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (url == null) {
      setState({ loading: false });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    getJson<T>(url, ctrl.signal)
      .then((data) => setState({ data, loading: false }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setState({ error, loading: false });
      });
    return () => ctrl.abort();
  }, [url, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
