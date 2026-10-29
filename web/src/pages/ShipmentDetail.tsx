import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Invoice, ShipmentDetail } from '../../../shared/types.ts';
import { NotFoundError, useApi } from '../api.ts';
import { EVENT_LABELS, companyName, day, label, money, pct, when } from '../format.ts';
import { NotFound } from './NotFound.tsx';

// Matches the decision engine's default off-route threshold; shown here only as context.
const OFF_ROUTE_KM = 50;

export function ShipmentDetailPage() {
  const { id = '' } = useParams();
  const { data, error, loading } = useApi<ShipmentDetail>(`/api/shipments/${encodeURIComponent(id)}`);

  if (error instanceof NotFoundError) return <NotFound message={`No shipment with ID ${id}.`} />;
  if (error) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Couldn't load shipment: {error.message}</p>;
  if (loading || !data) return <p className="text-sm text-stone-500">Loading {id}…</p>;

  const { shipment: s, payer, shipper, carrier, events, invoices, rate_rules } = data;
  const original = invoices.find((i) => !i.duplicate_of);
  const fuelCents = Math.round(s.booked_rate_cents * s.fuel_surcharge_pct / 100);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-accent-ink hover:underline">← All shipments</Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{s.shipment_id}</h1>
          <p className="text-stone-600">{s.origin_city}, {s.origin_state} → {s.dest_city}, {s.dest_state}</p>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">Scenario: {label(s.scenario)}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Booking">
          <Fields rows={[
            ['Shipper', `${companyName(shipper.name)} · ${shipper.industry}`],
            ['Forwarder', `${companyName(payer.name)} · ${payer.service_level === 'brokerage_only' ? 'brokerage only' : 'full service'}`],
            ['Carrier', `${companyName(carrier.name)} · ${carrier.carrier_id}`],
            ['Mode', label(s.mode)],
            ['Consignee', s.consignee],
            ['Pickup', when(s.pickup_ts)],
            ['Scheduled delivery', when(s.scheduled_delivery_ts)],
            ['Expected route', `${s.expected_route_km.toLocaleString('en-US')} km`],
            ['Virtual card', s.virtual_card_id],
          ]} />
        </Card>

        <Card title="Approved range">
          <Fields rows={[
            ['Booked rate', money(s.booked_rate_cents)],
            ['Fuel surcharge', `${money(fuelCents)} (${pct(s.fuel_surcharge_pct)})`],
            ['Approved maximum', <strong key="max">{money(s.approved_max_cents)}</strong>],
            ['Invoiced', original ? money(original.total_cents) : 'No invoice yet'],
          ]} />
          <p className="mt-3 text-xs text-stone-500">Approved maximum = (booked rate + fuel) × 1.10.</p>
          {original && <RangeBar invoiced={original.total_cents} max={s.approved_max_cents} />}
        </Card>

        <Card title="Carrier">
          <Fields rows={[
            ['Segment', `${label(carrier.segment)} · ${carrier.fleet_size} truck${carrier.fleet_size === 1 ? '' : 's'}`],
            ['USDOT / MC', `${carrier.usdot_number} / ${carrier.mc_number}`],
            ['Gets cash today by', label(carrier.cash_preference)],
            [carrier.cash_preference === 'factoring' ? 'Factoring rate, this load' : 'Factoring rate, if used', pct(s.factoring_rate_pct, 2)],
            ...(carrier.credit_line_apr_pct != null ? [['Credit-line APR', pct(carrier.credit_line_apr_pct)] as [string, ReactNode]] : []),
            ['Accepts cards', carrier.accepts_cards ? 'Yes' : 'No'],
            ['Bank account', `•••• ${carrier.bank_account_last4} · ${carrier.bank_account_verified ? 'verified' : 'not verified'}`],
            ['Bank details last changed', day(carrier.bank_account_last_changed)],
            ...(s.carrier_bank_change_request_date
              ? [['Bank change requested', <span key="b" className="font-medium text-amber-800">{day(s.carrier_bank_change_request_date)}</span>] as [string, ReactNode]]
              : []),
          ]} />
        </Card>
      </div>

      <Card title={`Tracking timeline · ${events.length} events`}>
        <ol className="relative space-y-3 border-l border-stone-200 pl-5">
          {events.map((e) => {
            const offRoute = e.off_route_km > OFF_ROUTE_KM;
            const otherRecipient = e.recipient != null && e.recipient !== s.consignee;
            return (
              <li key={e.event_id} className="relative">
                <span className={`absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full ${offRoute || otherRecipient ? 'bg-amber-500' : 'bg-stone-400'}`} />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-medium">{EVENT_LABELS[e.event_type] ?? e.event_type}</span>
                  <span className="text-sm text-stone-500">{when(e.ts)}</span>
                  <span className="text-xs text-stone-400">{label(e.source)}</span>
                </div>
                <div className="text-sm text-stone-600">
                  {e.lat.toFixed(4)}, {e.lon.toFixed(4)}
                  {e.event_type === 'IN_TRANSIT' && (
                    <span className={offRoute ? 'ml-2 font-medium text-amber-800' : 'ml-2'}>
                      · {e.off_route_km} km off expected route{offRoute ? ` (above ${OFF_ROUTE_KM} km)` : ''}
                    </span>
                  )}
                  {e.recipient && (
                    <span className={otherRecipient ? 'ml-2 font-medium text-amber-800' : 'ml-2'}>
                      · Signed by {e.recipient}{otherRecipient ? ` (consignee is ${s.consignee})` : ''}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {!events.some((e) => e.event_type === 'POD') && (
          <p className="mt-3 text-sm font-medium text-amber-800">No proof-of-delivery event received.</p>
        )}
      </Card>

      <Card title={`Invoices · ${invoices.length}`}>
        <InvoiceTable invoices={invoices} approvedMax={s.approved_max_cents} />
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-stone-600">Forwarder's allowed extra charges</summary>
          <table className="mt-2 text-sm">
            <tbody>
              {rate_rules.map((r) => (
                <tr key={r.charge_type}>
                  <td className="py-0.5 pr-6 text-stone-600">{label(r.charge_type)}</td>
                  <td className="py-0.5">{!r.allowed ? 'Not allowed' : r.max_cents_per_shipment != null ? `Up to ${money(r.max_cents_per_shipment)}` : r.cap_note ?? 'No cap'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <Card title="Decision and payment">
        <p className="text-sm text-stone-500">The decision engine and payment timeline arrive in phase 2.</p>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
      {children}
    </section>
  );
}

function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className="text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function RangeBar({ invoiced, max }: { invoiced: number; max: number }) {
  const over = invoiced > max;
  const scale = Math.max(invoiced, max) * 1.05;
  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full bg-stone-100">
        <div className={`h-2.5 rounded-full ${over ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${(invoiced / scale) * 100}%` }} />
        <div className="absolute -top-1 h-4.5 w-0.5 bg-stone-700" style={{ left: `${(max / scale) * 100}%` }} title="Approved maximum" />
      </div>
      <p className={`mt-1.5 text-xs ${over ? 'font-medium text-red-700' : 'text-stone-500'}`}>
        {over ? `${money(invoiced - max)} above the approved maximum` : `${money(max - invoiced)} under the approved maximum`}
      </p>
    </div>
  );
}

function InvoiceTable({ invoices, approvedMax }: { invoices: Invoice[]; approvedMax: number }) {
  if (invoices.length === 0) return <p className="text-sm text-stone-500">No invoices received.</p>;
  const lines = ['base', 'fuel', 'detention', 'liftgate', 'reweigh'] as const;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="py-1.5 pr-4">Invoice</th>
            <th className="py-1.5 pr-4">Date</th>
            {lines.map((l) => <th key={l} className="py-1.5 pr-4 text-right">{label(l)}</th>)}
            <th className="py-1.5 pr-4 text-right">Total</th>
            <th className="py-1.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {invoices.map((inv) => (
            <tr key={inv.invoice_id} className={inv.duplicate_of ? 'bg-amber-50' : ''}>
              <td className="whitespace-nowrap py-1.5 pr-4">{inv.invoice_id} <span className="text-stone-400">#{inv.invoice_number}</span></td>
              <td className="whitespace-nowrap py-1.5 pr-4">{day(inv.invoice_date)}</td>
              {lines.map((l) => {
                const cents = inv[`${l}_cents`];
                return <td key={l} className={`py-1.5 pr-4 text-right tabular-nums ${cents ? '' : 'text-stone-300'}`}>{money(cents)}</td>;
              })}
              <td className={`py-1.5 pr-4 text-right font-medium tabular-nums ${inv.total_cents > approvedMax ? 'text-red-700' : ''}`}>{money(inv.total_cents)}</td>
              <td className="whitespace-nowrap py-1.5 text-xs text-amber-800">{inv.duplicate_of ? `Duplicate of ${inv.duplicate_of}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
