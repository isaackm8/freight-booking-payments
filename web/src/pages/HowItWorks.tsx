import type { ReactNode } from 'react';

// The How it works page: what CashBridge does, as a five-step flow and a who-gets-paid-when timeline.
// Timing figures come from the sample data (payments_expected.csv, payers.csv) and the white paper.


type Actor = 'Forwarder' | 'Carrier' | 'Platform' | 'Card';

const STEPS: { title: string; actor: Actor; text: string; source: string }[] = [
  {
    title: 'Book',
    actor: 'Forwarder',
    text: 'Books the load for its shipper and sets the approved max: booked rate plus fuel, plus 10% for extras.',
    source: 'shipments.csv',
  },
  {
    title: 'Track',
    actor: 'Carrier',
    text: 'Moves the load. GPS and carrier updates show each milestone, whether it stays on route and if it runs late.',
    source: 'tracking_events.csv',
  },
  {
    title: 'Confirm delivery',
    actor: 'Carrier',
    text: 'Delivers the load to the right recipient, with proof of delivery: an RFID scan, a signature or a photo.',
    source: 'delivery_evidence.csv',
  },
  {
    title: 'Check',
    actor: 'Platform',
    text: 'Matches the invoice to the shipment ID, checks it against the approved max and the hold rules. Anything suspicious is held for review.',
    source: 'invoices.csv',
  },
  {
    title: 'Pay',
    actor: 'Card',
    text: "Charges the forwarder's virtual card and pays the carrier's bank account within hours.",
    source: 'provider_payouts.csv',
  },
];

const ACTOR_STYLE: Record<Actor, string> = {
  Forwarder: 'bg-ink text-white',
  Carrier: 'bg-stone-200 text-ink',
  Platform: 'bg-accent-soft text-accent-ink ring-1 ring-accent/30',
  Card: 'bg-accent text-white',
};

export function HowItWorks() {
  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">How CashBridge works</h1>
        <p className="mt-2 text-stone-600">
          Carriers get paid within hours of a confirmed delivery instead of waiting 30–45 days.
          The forwarder pays with its card, so it still pays about a month later, and anything that looks wrong is held before money moves.
        </p>
      </div>
      <section className="space-y-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6">
        <Flow />
        <PaymentTimeline />
      </section>
    </div>
  );
}

function Flow() {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">The flow, for every shipment ID</h3>
      <ol className="grid gap-3 md:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 rounded-xl bg-canvas p-4 md:flex-col md:gap-2">
            {i < STEPS.length - 1 && (
              <span aria-hidden className="absolute -right-3 top-8 z-10 hidden h-0.5 w-3 bg-stone-300 md:block" />
            )}
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              {i + 1}
            </span>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{s.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ACTOR_STYLE[s.actor]}`}>{s.actor}</span>
              </div>
              <p className="text-sm leading-snug text-stone-600">{s.text}</p>
              <p className="text-xs text-stone-400">
                Data: <code className="text-stone-500">{s.source}</code>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Days after delivery, on a 0–45 day scale.
const SCALE = 45;
const at = (day: number) => `${(day / SCALE) * 100}%`;

function PaymentTimeline() {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Who gets paid when, after delivery</h3>
      <p className="mb-4 text-sm text-stone-600">
        The carrier is paid about a month sooner, and the forwarder still pays about when it does today.
      </p>

      {/* Phones: the same facts as a list, since the scaled timeline needs width. */}
      <dl className="grid gap-3 text-sm sm:hidden">
        <div className="rounded-xl bg-canvas p-3">
          <dt className="font-semibold">Today</dt>
          <dd className="text-stone-600">Carrier paid by the forwarder in 30–45 days, or factors the invoice for 6–8%. Shipper pays the forwarder at 45 days.</dd>
        </div>
        <div className="rounded-xl bg-accent-soft p-3">
          <dt className="font-semibold">CashBridge</dt>
          <dd className="text-stone-700">Carrier paid in ~12 hours. Forwarder pays its card bill ~32 days later. Shipper pays the forwarder at 45 days.</dd>
        </div>
      </dl>

      <div className="hidden sm:block">
      <div className="space-y-5">
        <Row label="Today">
          <Range from={30} to={45} className="bg-stone-300" />
          <Marker day={37.5} tone="muted" text="Carrier paid by the forwarder in 30–45 days, or factors the invoice for 6–8%" align="end" />
          <Marker day={45} tone="muted" text="Shipper pays the forwarder, day 45" align="end" below />
        </Row>

        <Row label="CashBridge">
          <Range from={0} to={0.8} className="bg-accent" />
          <Marker day={0.5} tone="accent" text="Carrier paid in ~12 hours" align="start" />
          <Range from={14} to={44} className="bg-ink/15" />
          <Marker day={32} tone="ink" text="Forwarder pays its card bill, ~32 days on average" />
          <Marker day={45} tone="muted" text="Shipper pays the forwarder, day 45" align="end" below />
        </Row>
      </div>

      <div className="relative ml-36 mt-3 h-4 text-[11px] text-stone-400">
        {[0, 15, 30, 45].map((d) => (
          <span key={d} className={`absolute whitespace-nowrap ${d === 0 ? '' : d === SCALE ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: at(d) }}>
            {d === 0 ? 'Delivery' : `Day ${d}`}
          </span>
        ))}
      </div>
      </div>
      <p className="mt-3 text-xs text-stone-400">
        CashBridge figures are from the sample data (carrier funds in 4–20 hours; card float 14–44 days). Today's 30–45 days and 6–8% factoring cost are from the Mastercard white paper.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center">
      <div className="w-36 shrink-0 text-sm font-semibold">{label}</div>
      <div className="relative mr-1 h-16 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-stone-100" />
        {children}
      </div>
    </div>
  );
}

function Range({ from, to, className }: { from: number; to: number; className: string }) {
  return (
    <div
      className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full ${className}`}
      style={{ left: at(from), width: `max(6px, ${((to - from) / SCALE) * 100}%)` }}
    />
  );
}

function Marker({ day, text, tone, align = 'center', below = false }: {
  day: number;
  text: string;
  tone: 'accent' | 'ink' | 'muted';
  align?: 'start' | 'center' | 'end';
  below?: boolean;
}) {
  const dot = { accent: 'bg-accent', ink: 'bg-ink', muted: 'bg-stone-400' }[tone];
  const shift = { start: 'translate-x-0', center: '-translate-x-1/2', end: '-translate-x-full' }[align];
  return (
    <>
      <span aria-hidden className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${dot}`} style={{ left: at(day) }} />
      <span
        className={`absolute ${below ? 'top-[calc(50%+12px)]' : 'bottom-[calc(50%+12px)]'} ${shift} whitespace-nowrap text-xs leading-tight ${tone === 'muted' ? 'text-stone-500' : 'font-medium text-ink'}`}
        style={{ left: at(day) }}
      >
        {text}
      </span>
    </>
  );
}
