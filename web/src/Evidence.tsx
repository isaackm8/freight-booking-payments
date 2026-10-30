import type { ReactNode } from 'react';
import { HOLD_REASONS, type HoldReason } from '../../shared/decisions.ts';
import type { ShipmentDetail } from '../../shared/types.ts';
import { EVIDENCE_LABELS, EXCEPTION_LABELS, companyName, day, label, money, when } from './format.ts';

const OFF_ROUTE_MI = 2; // the engine's default threshold
const DAY = 86_400_000;

// The evidence behind each reason a payment was held, side by side with the decision,
// so a reviewer can release or reject without digging through the shipment page.
export function Evidence({ detail }: { detail: ShipmentDetail }) {
  const reasons = detail.decision?.reasons ?? [];
  return (
    <div className="space-y-3">
      {reasons.map((r) => (
        <section key={r} className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden className="h-2 w-2 rounded-full bg-amber-500" />
            {HOLD_REASONS[r]}
          </h3>
          <div className="mt-2 text-sm">{EVIDENCE[r]?.(detail)}</div>
        </section>
      ))}
    </div>
  );
}

const EVIDENCE: Partial<Record<HoldReason, (d: ShipmentDetail) => ReactNode>> = {
  amount_above_approved_range: ({ shipment: s, invoices, rate_rules: rules }) => {
    const inv = invoices.find((i) => !i.duplicate_of);
    if (!inv) return <p className="text-stone-500">No invoice.</p>;
    const over = inv.total_cents - s.approved_max_cents;
    const cap = (type: string) => rules.find((r) => r.charge_type === type);
    const extras = (['detention', 'liftgate', 'reweigh'] as const)
      .map((type) => ({ type, cents: inv[`${type}_cents`], rule: cap(type) }))
      .filter((x) => x.cents > 0);
    return (
      <>
        <Facts rows={[
          ['Invoice total', <strong key="t">{money(inv.total_cents)}</strong>],
          ['Approved maximum', money(s.approved_max_cents)],
          ['Over by', <span key="o" className="font-semibold text-red-700">{money(over)} ({((over / s.approved_max_cents) * 100).toFixed(1)}%)</span>],
          ['Booked rate + fuel', `${money(inv.base_cents)} + ${money(inv.fuel_cents)}`],
        ]} />
        {extras.length > 0 ? (
          <div className="mt-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Extra charges vs the forwarder’s caps</div>
            <Facts rows={extras.map(({ type, cents, rule }) => {
              const max = rule?.max_cents_per_shipment ?? null;
              const ok = rule?.allowed && (max == null || cents <= max);
              return [label(type), (
                <span key={type} className={ok ? '' : 'font-semibold text-red-700'}>
                  {money(cents)} · {!rule?.allowed ? 'not allowed' : max != null ? `cap ${money(max)}` : 'no cap'}{ok ? '' : ' · over the cap'}
                </span>
              )];
            })} />
          </div>
        ) : (
          <p className="mt-2 text-stone-600">No extra charges: the base or fuel amount itself is above what was booked.</p>
        )}
      </>
    );
  },

  off_route: ({ events, shipment: s }) => {
    const off = events.filter((e) => e.event_type === 'IN_TRANSIT' && e.off_route_mi > OFF_ROUTE_MI);
    return (
      <>
        <p className="text-stone-600">
          {off.length} in-transit update{off.length === 1 ? '' : 's'} more than {OFF_ROUTE_MI} mi off the expected {s.expected_route_mi.toLocaleString('en-US')} mi route:
        </p>
        <Facts rows={off.map((e) => [when(e.ts), (
          <span key={e.event_id}><strong className="text-red-700">{e.off_route_mi} mi off route</strong> · {e.lat.toFixed(3)}, {e.lon.toFixed(3)} · {label(e.source)}</span>
        )])} />
      </>
    );
  },

  delivered_to_unexpected_recipient: ({ events, evidence, shipment: s }) => {
    const delivered = events.find((e) => e.event_type === 'DELIVERED');
    return (
      <Facts rows={[
        ['Should go to (consignee)', <strong key="c">{s.consignee}</strong>],
        ['Delivered to', <strong key="d" className="text-red-700">{delivered?.recipient ?? '—'}</strong>],
        ['Delivered', when(delivered?.ts)],
        ...evidence.filter((v) => v.recipient).map((v) => [EVIDENCE_LABELS[v.kind] ?? v.kind, `${v.recipient} · ${when(v.ts)}`] as [string, ReactNode]),
      ]} />
    );
  },

  bank_account_changed_recently: ({ shipment: s, carrier, decision }) => {
    const paidOn = decision?.decided_ts ?? null;
    const daysBefore = (date: string | null) =>
      date && paidOn ? Math.round((Date.parse(paidOn.slice(0, 10)) - Date.parse(date)) / DAY) : null;
    const requested = daysBefore(s.carrier_bank_change_request_date);
    const changed = daysBefore(carrier.bank_account_last_changed);
    return (
      <>
        <Facts rows={[
          ['Payment would have been made', when(paidOn)],
          ...(s.carrier_bank_change_request_date
            ? [['Bank change requested', <strong key="r" className="text-red-700">{day(s.carrier_bank_change_request_date)} · {requested} days before</strong>] as [string, ReactNode]]
            : []),
          ['Bank details last changed', `${day(carrier.bank_account_last_changed)}${changed != null && changed <= 14 && changed >= 0 ? ` · ${changed} days before` : ''}`],
          ['Account on file', `•••• ${carrier.bank_account_last4} · ${carrier.bank_account_verified ? 'verified' : 'not verified'}`],
        ]} />
        <p className="mt-2 text-stone-600">
          A change of bank details just before a payment is a common fraud pattern. Confirm the change with {companyName(carrier.name)} using
          contact details you already hold, not ones in the request.
        </p>
      </>
    );
  },

  missing_proof_of_delivery: ({ events }) => {
    const delivered = events.find((e) => e.event_type === 'DELIVERED');
    return (
      <Facts rows={[
        ['Delivered', delivered ? when(delivered.ts) : 'No delivery recorded'],
        ['Proof received', <strong key="p" className="text-red-700">None: no RFID scan, signature or photo</strong>],
      ]} />
    );
  },

  delivery_exception: ({ events }) => (
    <Facts rows={events.filter((e) => e.event_type === 'EXCEPTION').map((e) => [when(e.ts), (
      <strong key={e.event_id} className="text-red-700">{EXCEPTION_LABELS[e.reason ?? ''] ?? e.reason}</strong>
    )])} />
  ),
};

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
