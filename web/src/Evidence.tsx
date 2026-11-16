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
    const worst = Math.max(...off.map((e) => e.off_route_mi));
    return (
      <>
        <p className="text-stone-700">
          GPS put the truck up to <strong className="text-red-700">{worst.toLocaleString('en-US')} mi</strong> off the planned{' '}
          {s.origin_city} → {s.dest_city} route ({s.expected_route_mi.toLocaleString('en-US')} mi).
        </p>
        <RouteMap shipment={s} events={events} />
        <Facts rows={off.map((e) => [when(e.ts), (
          <span key={e.event_id}><strong className="text-red-700">{e.off_route_mi} mi off route</strong> · {label(e.source)}</span>
        )])} />
        <p className="mt-2 text-xs text-stone-500">
          Hold rule: any in-transit GPS update more than {OFF_ROUTE_MI} mi from the planned route, set tight so a reviewer sees every detour.
        </p>
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

// A sketch of the load's path: the planned route as a straight dashed line from origin to destination,
// the truck's GPS updates joined in order, and the off-route ones in red with how far off they were.
// Positions are projected from latitude and longitude; there is no basemap.
function RouteMap({ shipment: s, events }: { shipment: ShipmentDetail['shipment']; events: ShipmentDetail['events'] }) {
  const W = 520, H = 200, PAD_X = 70, PAD_Y = 34;
  const track = [
    { lat: s.origin_lat, lon: s.origin_lon, off: 0 },
    ...events.filter((e) => e.event_type === 'IN_TRANSIT').map((e) => ({ lat: e.lat, lon: e.lon, off: e.off_route_mi })),
    { lat: s.dest_lat, lon: s.dest_lon, off: 0 },
  ];
  const kx = Math.cos((((s.origin_lat + s.dest_lat) / 2) * Math.PI) / 180); // shrink longitude to match latitude
  const xs = track.map((p) => p.lon * kx), ys = track.map((p) => p.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((W - 2 * PAD_X) / (x1 - x0 || 1), (H - 2 * PAD_Y) / (y1 - y0 || 1));
  const cx = (W - (x1 - x0) * scale) / 2, cy = (H - (y1 - y0) * scale) / 2;
  const pt = (p: { lat: number; lon: number }) => ({ x: cx + (p.lon * kx - x0) * scale, y: H - cy - (p.lat - y0) * scale });
  const pts = track.map(pt);
  const [a, b] = [pts[0], pts[pts.length - 1]];
  return (
    <figure className="my-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="w-full rounded-lg bg-canvas"
        aria-label={`Planned route ${s.origin_city} to ${s.dest_city}, with ${track.filter((p) => p.off > OFF_ROUTE_MI).length} GPS updates off route`}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#a8a29e" strokeWidth={3} strokeDasharray="6 5" />
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#141413" strokeWidth={1.5} />
        {track.map((p, i) => {
          const q = pts[i], bad = p.off > OFF_ROUTE_MI, end = i === 0 || i === track.length - 1;
          return (
            <g key={i}>
              <circle cx={q.x} cy={q.y} r={bad ? 7 : end ? 6 : 4} fill={bad ? '#dc2626' : end ? '#141413' : '#fff'} stroke="#141413" strokeWidth={bad ? 0 : 1.5} />
              {bad && <text x={q.x} y={q.y - 12} textAnchor="middle" fontSize={13} fontWeight={700} fill="#b91c1c">{p.off} mi off</text>}
            </g>
          );
        })}
        <text x={a.x} y={a.y + 22} textAnchor="middle" fontSize={12} fill="#44403c">{s.origin_city}</text>
        <text x={b.x} y={b.y + 22} textAnchor="middle" fontSize={12} fill="#44403c">{s.dest_city}</text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 text-xs text-stone-500">
        <span><span aria-hidden className="mr-1 inline-block w-4 border-t-2 border-dashed border-stone-400 align-middle" />Planned route</span>
        <span><span aria-hidden className="mr-1 inline-block w-4 border-t border-ink align-middle" />Truck’s GPS path</span>
        <span><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600 align-middle" />Off route</span>
      </figcaption>
    </figure>
  );
}

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
