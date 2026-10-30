import { useState } from 'react';
import { REVIEW_LABELS, type InfoRequest, type Review } from '../../shared/decisions.ts';
import { send } from './api.ts';
import { companyName, when } from './format.ts';

export const REVIEW_STYLE = {
  awaiting_review: 'bg-amber-100 text-amber-900',
  released: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
} as const;

const OUTCOME = {
  released: 'Payment released and paid. CashBridge charged the forwarder’s card and paid the carrier; the breakdown is below.',
  rejected: 'Payment rejected. Nothing is paid; the carrier is told the reason and can take it up with the forwarder.',
} as const;

export type ReviewAction = 'released' | 'rejected' | 'info_requested' | 'undone';

// A held payment: who was notified, the review status, and Release / Reject / Request info for the forwarder.
export function ReviewPanel({ shipmentId, forwarder, notifiedTs, review, infoRequest, canRelease, onChange }: {
  shipmentId: string;
  forwarder: string;
  notifiedTs: string | null;
  review: Review | null;
  infoRequest: InfoRequest | null; // an open request to the carrier
  canRelease: boolean; // false for a load that was never delivered (refused)
  onChange: (action: ReviewAction) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = review?.status ?? 'awaiting_review';

  const act = async (action: ReviewAction) => {
    setBusy(true);
    setError(null);
    const base = `/api/shipments/${encodeURIComponent(shipmentId)}`;
    try {
      if (action === 'undone') await send(`${base}/review`, 'DELETE');
      else if (action === 'info_requested') await send(`${base}/request-info`, 'POST', { note });
      else await send(`${base}/review`, 'POST', { status: action, note });
      setNote('');
      onChange(action);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl bg-white p-4 text-ink ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Forwarder review</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${REVIEW_STYLE[status]}`}>{REVIEW_LABELS[status]}</span>
      </div>

      <p className="mt-2 flex gap-2 text-sm text-stone-700">
        <span aria-hidden>✉</span>
        <span>
          Notification sent to <strong>{companyName(forwarder)}</strong>’s accounts payable team
          {notifiedTs && <> on {when(notifiedTs)}</>}, by email and in the app (simulated).
        </span>
      </p>

      {review ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>{OUTCOME[review.status]}</p>
          <p className="text-stone-500">
            {review.status === 'released' ? 'Released' : 'Rejected'} by {review.reviewed_by} on {when(review.reviewed_ts)}
            {review.note && <> · “{review.note}”</>}
          </p>
          <button type="button" disabled={busy} onClick={() => act('undone')}
            className="text-sm font-medium text-accent-ink hover:underline disabled:opacity-50">
            Undo review (demo)
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {infoRequest && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong>Info requested from the carrier</strong> on {when(infoRequest.ts)}: “{infoRequest.note}”. The payment stays held
              until you release or reject it.
            </p>
          )}
          <label className="block text-sm text-stone-600" htmlFor={`note-${shipmentId}`}>
            Note for the record (optional; required to request info)
          </label>
          <textarea id={`note-${shipmentId}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="e.g. Detour confirmed with the carrier"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !canRelease} onClick={() => act('released')}
              className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50">
              Release payment
            </button>
            <button type="button" disabled={busy} onClick={() => act('rejected')}
              className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-semibold text-stone-700 hover:border-red-400 hover:text-red-700 disabled:opacity-50">
              Reject payment
            </button>
            <button type="button" disabled={busy || !note.trim()} onClick={() => act('info_requested')}
              title={note.trim() ? 'Ask the carrier for this information; the payment stays held' : 'Write what you need in the note first'}
              className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-semibold text-stone-700 hover:border-ink hover:text-ink disabled:opacity-50">
              Request info from carrier
            </button>
          </div>
        </div>
      )}
      {!review && !canRelease && (
        <p className="mt-2 text-sm text-stone-600">This load wasn’t delivered, so its payment can’t be released. It can only be rejected.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
