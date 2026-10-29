import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ShipmentNeighbors } from '../../shared/types.ts';
import { useApi } from './api.ts';

// Back to the list, and previous / next shipment within the same filtered list.
// The list's filters travel in the URL's query string, so they're kept while moving.
// The ← and → keys also move, unless the user is typing.
export function ShipmentNav({ shipmentId }: { shipmentId: string }) {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { data } = useApi<ShipmentNeighbors>(`/api/shipments/${encodeURIComponent(shipmentId)}/neighbors${search}`);
  const href = (id: string) => `/shipments/${id}${search}`;
  const filtered = new URLSearchParams(search).size > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.altKey || e.ctrlKey || e.metaKey || el.closest('input, textarea, select, [contenteditable]')) return;
      const to = e.key === 'ArrowLeft' ? data?.prev : e.key === 'ArrowRight' ? data?.next : null;
      if (to) navigate(href(to));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const step = 'rounded-full border border-stone-300 bg-white px-3 py-1 font-medium text-stone-700 hover:border-ink hover:text-ink';
  return (
    <nav aria-label="Shipments" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <Link to={`/${search}`} className="text-accent-ink hover:underline">
        ← {filtered ? 'Back to filtered list' : 'All shipments'}
      </Link>
      <div className="flex items-center gap-2">
        {data?.prev
          ? <Link to={href(data.prev)} className={step} title={`${data.prev} (← key)`}>‹ Previous</Link>
          : <span className={`${step} pointer-events-none opacity-40`}>‹ Previous</span>}
        <span className="min-w-20 text-center text-xs text-stone-500">
          {data && (data.position ? `${data.position} of ${data.total}` : `Left this list · ${data.total} remain`)}
        </span>
        {data?.next
          ? <Link to={href(data.next)} className={step} title={`${data.next} (→ key)`}>Next ›</Link>
          : <span className={`${step} pointer-events-none opacity-40`}>Next ›</span>}
      </div>
    </nav>
  );
}
