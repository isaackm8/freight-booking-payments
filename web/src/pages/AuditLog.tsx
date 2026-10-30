import { Link } from 'react-router-dom';
import type { AuditLogResponse } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { companyName, when } from '../format.ts';

const ACTION: Record<AuditLogResponse['entries'][number]['action'], { text: string; style: string }> = {
  released: { text: 'Released', style: 'bg-emerald-100 text-emerald-800' },
  rejected: { text: 'Rejected', style: 'bg-red-100 text-red-800' },
  review_undone: { text: 'Review undone', style: 'bg-stone-100 text-stone-700' },
  info_requested: { text: 'Info requested', style: 'bg-amber-100 text-amber-900' },
};

// Every review action on a held payment, newest first. Append-only: an undo is its own entry.
export function AuditLog() {
  const { data, error } = useApi<AuditLogResponse>('/api/audit-log');
  if (error) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Couldn't load the audit log: {error.message}</p>;
  if (!data) return <p className="text-sm text-stone-500">Loading the audit log…</p>;
  const { entries, counts } = data;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/cash-flow-hub" className="text-sm text-accent-ink hover:underline">← Cash Flow Hub</Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1 max-w-3xl text-stone-600">
          Every review action on a held payment: who did what, when, and why. Entries are never edited or deleted; undoing a review
          adds its own entry.
        </p>
        <p className="mt-2 text-sm text-stone-500">
          {counts.released} released · {counts.rejected} rejected · {counts.info_requested} info requests · {counts.review_undone} undone
        </p>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        {entries.length === 0 ? (
          <p className="text-sm text-stone-500">
            No reviews yet. When someone releases or rejects a held payment, it shows up here.{' '}
            <Link to="/review-queue" className="font-medium text-accent-ink hover:underline">Open the review queue</Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-1.5 pr-4">When</th><th className="py-1.5 pr-4">Action</th><th className="py-1.5 pr-4">Shipment</th>
                  <th className="py-1.5 pr-4">Forwarder</th><th className="py-1.5 pr-4">Carrier</th><th className="py-1.5 pr-4">Note</th>
                  <th className="py-1.5">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap py-2 pr-4 text-stone-600">{when(e.ts)}</td>
                    <td className="whitespace-nowrap py-2 pr-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ACTION[e.action].style}`}>{ACTION[e.action].text}</span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 font-semibold">
                      <Link to={`/shipments/${e.shipment_id}`} className="text-accent-ink hover:underline">{e.shipment_id}</Link>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 text-stone-600">{companyName(e.payer_name)}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-stone-600">{companyName(e.carrier_name)}</td>
                    <td className="min-w-56 py-2 pr-4 text-stone-700">{e.note ?? <span className="text-stone-400">—</span>}</td>
                    <td className="whitespace-nowrap py-2 text-stone-500">{e.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
