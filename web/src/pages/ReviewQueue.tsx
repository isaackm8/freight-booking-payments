import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HOLD_REASONS } from '../../../shared/decisions.ts';
import type { QueueStatus, ReviewQueueResponse, ShipmentDetail } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { Evidence } from '../Evidence.tsx';
import { ReviewPanel, REVIEW_STYLE, type ReviewAction } from '../ReviewPanel.tsx';
import { companyName, money } from '../format.ts';

const STATUSES: { id: QueueStatus; text: string }[] = [
  { id: 'awaiting_review', text: 'Needs review' },
  { id: 'info_requested', text: 'Info requested' },
  { id: 'released', text: 'Released' },
  { id: 'rejected', text: 'Rejected' },
  { id: 'all', text: 'All' },
];

// Wide screens show the list and the selected payment side by side; narrow ones open it under its row.
const WIDE = '(min-width: 1024px)';
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

// Held payments, longest waiting first. Pick one to see its evidence beside the decision, then
// release, reject or ask the carrier for more information. The next payment opens after each decision.
export function ReviewQueue() {
  const wide = useWide();
  const activeRow = useRef<HTMLLIElement>(null);
  const [params, setParams] = useSearchParams();
  const payerId = params.get('payer_id') ?? '';
  const status = (params.get('status') ?? 'awaiting_review') as QueueStatus;
  const query = new URLSearchParams({ status, ...(payerId ? { payer_id: payerId } : {}) });
  const queue = useApi<ReviewQueueResponse>(`/api/review-queue?${query}`);
  const items = queue.data?.items ?? [];
  const selectedId = params.get('id') ?? items[0]?.shipment_id ?? null;
  const detail = useApi<ShipmentDetail>(selectedId ? `/api/shipments/${encodeURIComponent(selectedId)}` : null);

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  };

  // After a decision, open the next payment in the list (or the previous one if this was the last).
  const onChange = (action: ReviewAction) => {
    if (action !== 'undone' && selectedId) {
      const i = items.findIndex((x) => x.shipment_id === selectedId);
      const next = items[i + 1] ?? items[i - 1];
      setParam({ id: next ? next.shipment_id : null });
    }
    queue.reload();
    detail.reload();
  };

  const d = detail.data?.shipment.shipment_id === selectedId ? detail.data : null;
  const counts = queue.data?.counts;

  // On narrow screens, bring the opened row (and its details below it) into view.
  useEffect(() => {
    if (!wide && params.get('id')) activeRow.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [wide, selectedId, d != null]);

  const panel = !selectedId ? null : !d ? (
    <p className="p-4 text-sm text-stone-500">Loading {selectedId}…</p>
  ) : (
    <SelectedPayment d={d} onChange={onChange} />
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review queue</h1>
          <p className="mt-1 max-w-3xl text-stone-600">
            Payments the engine held, longest waiting first. Check the evidence, then release, reject or ask the carrier for more information.
          </p>
        </div>
        {queue.data && (
          <div role="group" aria-label="Forwarder" className="flex flex-wrap gap-1 rounded-full bg-white p-1 ring-1 ring-stone-200">
            {[{ id: '', name: 'All forwarders' }, ...queue.data.payers].map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === payerId} onClick={() => setParam({ payer_id: p.id || null, id: null })}
                className={`rounded-full px-3 py-1 text-sm font-medium ${p.id === payerId ? 'bg-ink text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
                {companyName(p.name).replace(/ (Freight )?(Forwarding|Partners)$/, '')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div role="group" aria-label="Status" className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <button key={s.id} type="button" aria-pressed={status === s.id} onClick={() => setParam({ status: s.id === 'awaiting_review' ? null : s.id, id: null })}
            className={`rounded-full px-3 py-1 text-sm font-medium ${status === s.id ? 'bg-ink text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:text-ink'}`}>
            {s.text}
            {counts && s.id !== 'all' && <span className="ml-1.5 tabular-nums opacity-70">{counts[s.id]}</span>}
          </button>
        ))}
      </div>

      {queue.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Couldn't load the queue: {queue.error.message}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ol aria-label="Held payments" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 lg:max-h-[75vh] lg:overflow-y-auto">
          {queue.data && items.length === 0 && (
            <li className="p-5 text-sm text-stone-500">
              {status === 'awaiting_review' ? 'Nothing waiting. Every held payment has been reviewed.' : 'No payments here.'}
            </li>
          )}
          {items.map((q) => {
            const active = q.shipment_id === selectedId;
            return (
              <li key={q.shipment_id} ref={active ? activeRow : undefined} className="scroll-mt-4 border-b border-stone-100 last:border-0">
                <button type="button" onClick={() => setParam({ id: q.shipment_id })} aria-current={active ? 'true' : undefined}
                  className={`block w-full px-4 py-3 text-left hover:bg-canvas ${active ? 'bg-accent-soft hover:bg-accent-soft' : ''}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{q.shipment_id}</span>
                    <span className="text-xs tabular-nums text-stone-500">{q.days_waiting} day{q.days_waiting === 1 ? '' : 's'} waiting</span>
                  </div>
                  <div className="text-sm text-stone-600">{companyName(q.carrier_name)} · {money(q.invoice_cents)}</div>
                  <div className="text-xs text-stone-500">{q.reasons.map((r) => HOLD_REASONS[r]).join('; ')}</div>
                  {(q.info_requested || q.review_status !== 'awaiting_review') && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${q.info_requested ? REVIEW_STYLE.awaiting_review : REVIEW_STYLE[q.review_status]}`}>
                      {q.info_requested ? 'Info requested' : q.review_status === 'released' ? 'Released' : 'Rejected'}
                    </span>
                  )}
                </button>
                {active && !wide && <div className="space-y-4 bg-canvas p-3">{panel}</div>}
              </li>
            );
          })}
        </ol>

        {wide && <div className="space-y-4">{panel}</div>}
      </div>
    </div>
  );
}

function SelectedPayment({ d, onChange }: { d: ShipmentDetail; onChange: (action: ReviewAction) => void }) {
  return (
    <>
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-bold tracking-tight">{d.shipment.shipment_id}</h2>
          <Link to={`/shipments/${d.shipment.shipment_id}?decision=held_for_review`} className="text-sm font-medium text-accent-ink hover:underline">
            Open full shipment →
          </Link>
        </div>
        <p className="text-stone-600">{d.shipment.origin_city}, {d.shipment.origin_state} → {d.shipment.dest_city}, {d.shipment.dest_state}</p>
        <p className="mt-1 text-sm text-stone-500">
          Carrier {companyName(d.carrier.name)} · Forwarder {companyName(d.payer.name)} · Shipper {companyName(d.shipper.name)}
        </p>
        <ReviewPanel shipmentId={d.shipment.shipment_id} forwarder={d.payer.name} notifiedTs={d.decision?.decided_ts ?? null}
          review={d.review} infoRequest={d.info_request} canRelease={d.can_release} onChange={onChange} />
      </section>
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Evidence</h3>
        <Evidence detail={d} />
      </div>
    </>
  );
}
