import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { HoldReason } from '../../../shared/decisions.ts';
import type { Dashboard, ShipmentDetail } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { day, money } from '../format.ts';

// The Why CashBridge page: the value in about a minute, for readers who don't know freight, told from the
// forwarder's side first (the assumed primary buyer), then the carrier's,
// then how it works (a five-step flow and a who-gets-paid-when timeline).
// Example-load and demo figures come live from the API; 30–45 days and 6–8% are from the Mastercard white paper.

const EXAMPLE_ID = 'SHP-10001';
const EXAMPLE_FACTORING_PCT = 7; // the middle of the white paper's 6–8%
const FORWARDER_BORROWING_APR = 8; // %, an assumed cost of borrowing to value the float (illustrative)

// Short names for the 8 hold rules (full wording in HOLD_REASONS).
const HOLDS: Record<HoldReason, string> = {
  amount_above_approved_range: 'Invoice above the agreed amount',
  duplicate_invoice_received: 'Duplicate invoice',
  bank_account_changed_recently: 'Bank details changed just before payment',
  off_route: 'Truck went off route',
  delivered_to_unexpected_recipient: 'Delivered to the wrong recipient',
  missing_proof_of_delivery: 'No proof of delivery',
  delivery_exception: 'Damaged, refused or short',
  shipment_on_hold: 'Load on hold, not delivered',
};

const TODAY_PARTS = ['Tracking', 'Invoice checks', 'Payment', 'Financing (factoring)'];

// What CashBridge does instead, in one connected flow. The engine is rules-based today; AI is the
// next step (learning from reviewers' decisions), so the page says so rather than claiming AI now.
const CASHBRIDGE_PARTS: { title: string; text: string; next?: boolean }[] = [
  { title: 'Authenticated shipment', text: 'GPS, RFID, signature or photo prove the load was delivered, to the right place.' },
  { title: 'Automated decisioning', text: 'Every invoice checked against 8 rules in seconds; most are paid with no one involved.' },
  { title: 'Instant payment', text: 'Card charge and payout to the carrier’s bank within hours of proven delivery.' },
  { title: 'AI, next', text: 'Learn from reviewers’ decisions to spot fraud earlier and cut false holds.', next: true },
];

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

export function WhyCashBridge() {
  const example = useApi<ShipmentDetail>(`/api/shipments/${EXAMPLE_ID}`);
  const demo = useApi<Dashboard>('/api/dashboard');
  const s = example.data?.payment?.settlement;
  const networkFee = s ? money(s.network_fee_cents) : '…';
  const invoice = example.data?.payment ? money(example.data.payment.amount_cents) : '…';
  const t = demo.data?.totals;
  const autoPct = t ? Math.round((t.paid / t.shipments) * 100) : null;
  const shipperTerms = example.data?.payer.customer_terms_days ?? '…';
  const carrierTerms = example.data?.payer.current_terms_to_carriers_days ?? '…';

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {/* 1. The problem: the forwarder's cash gap first, the carrier's wait second */}
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Why CashBridge</h1>
        <p className="text-sm text-stone-500">
          Written for the forwarder (freight forwarder or broker), our <strong>assumed primary buyer</strong>. Carriers are the second audience.
        </p>
        <p className="max-w-3xl text-lg leading-relaxed text-stone-700 sm:text-xl">
          Shippers pay the forwarder in <strong>{shipperTerms} days</strong>, but the forwarder pays its carriers in about{' '}
          <strong>{carrierTerms} days</strong>. So on every load the forwarder's own cash is tied up for weeks: money it needs to run the
          business, make payroll, grow and take on more loads.
        </p>
        <p className="max-w-3xl leading-relaxed text-stone-600">
          The other side of the same problem: truckers (carriers) wait 30–45 days to get paid. To get money sooner, small carriers use{' '}
          <strong>factoring</strong>: they sell the invoice to a finance company, which pays now but keeps <strong>6–8%</strong>.
        </p>
      </header>

      {/* 2. Today it's pieced together */}
      <Section title="Today it's pieced together">
        <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
          <div className="grid grid-cols-2 gap-2">
            {TODAY_PARTS.map((p) => (
              <div key={p} className="rounded-xl border border-dashed border-stone-300 bg-canvas px-3 py-4 text-center text-sm font-medium text-stone-600">
                {p}
              </div>
            ))}
          </div>
          <span aria-hidden className="text-center text-2xl text-stone-400 md:px-2"><span className="md:hidden">↓</span><span className="hidden md:inline">→</span></span>
          <div className="rounded-2xl bg-accent-soft p-5 ring-2 ring-accent">
            <div className="text-lg font-bold">CashBridge</div>
            <p className="text-sm text-stone-700">Automated decisioning and payment on authenticated shipments, in one flow.</p>
            <ul className="mt-3 space-y-2">
              {CASHBRIDGE_PARTS.map((part) => (
                <li key={part.title} className="text-sm">
                  <span className="font-semibold">{part.title}</span>
                  {part.next && <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-ink ring-1 ring-accent/40">roadmap</span>}
                  <span className="block text-stone-600">{part.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-stone-700">
          Today these are separate tools with manual handoffs, and nothing ties the payment to proof of delivery for both the forwarder and
          the carrier. CashBridge connects them: the shipment is authenticated, the decision is automated, and the money moves.
        </p>
      </Section>

      {/* 3. The fix */}
      <div className="rounded-2xl bg-ink p-6 text-lg leading-relaxed text-white sm:text-xl">
        <span className="font-semibold text-accent">The fix: </span>
        the forwarder pays on its card, so its cash <strong>stays in its account</strong> until the card bill is due, about a month after the carrier is paid and close to when the shipper pays.
        The carrier still gets paid <strong>within hours of proven delivery</strong>.
      </div>

      {/* 4. Who wins */}
      <Section title="Who wins">
        <div className="grid gap-4 md:grid-cols-3">
          <WinCard who="Forwarder" tag="Primary buyer" points={[
            'Keeps its cash about a month on every load',
            `Fewer invoices by hand: ${autoPct ?? '…'}% checked and paid automatically`,
            'Better carrier relationships and capacity: the customer carriers want to haul for',
          ]} />
          <WinCard who="Carrier" points={[
            'Paid in hours, not 30–45 days',
            'Costs 2.75% or less, vs factoring (6–8%)',
            'Built for carriers who factor; for carriers with a cheap credit line, the benefit is speed',
          ]} />
          <WinCard who="Mastercard and issuing banks" accent points={['New payment volume on Mastercard rails', 'A network fee and interchange on every load', 'More commercial card spend']} />
        </div>
      </Section>

      {/* 5. Why it matters for Mastercard */}
      <Section title="Why it matters for Mastercard">
        <ul className="space-y-3">
          <Point title="New volume on Mastercard rails">
            Carrier payments are mostly ACH or check today. CashBridge moves them to commercial card, with a Mastercard Move payout to the carrier's bank.
          </Point>
          <Point title="Network revenue on every load">
            About {networkFee} on a {invoice} load at {s ? pct2(s.network_fee_cents, example.data!.payment!.amount_cents) : '0.13%'} in our model (illustrative).
          </Point>
          <Point title="Commercial card growth for issuing banks">
            Every load is card spend on the forwarder's card, earning the issuer interchange.
          </Point>
          <Point title="Shipment-level data">
            Each payment carries the shipment, route and proof of delivery: better fraud prevention, and rich invoice data that can qualify for lower interchange.
          </Point>
          <Point title="B2B is card's biggest untapped area">
            CashBridge puts the thesis of Mastercard's own freight white paper into practice.
          </Point>
        </ul>
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong>Market size: [placeholder, to verify]</strong> US carrier payments a year, and the share paid by card today. No figure is quoted until sourced.
        </p>
      </Section>

      {/* 6. One load, today vs CashBridge */}
      <Section title="One load, today vs CashBridge">
        <ExampleLoad detail={example.data} error={example.error} />
      </Section>

      {/* 7. Why it's safe */}
      <Section title="Why it's safe">
        <p className="text-stone-700">
          Money moves <strong>only after proven delivery</strong>: an RFID scan at the dock, a signature or a photo.
          Eight kinds of problems are held for the forwarder to review before any payment:
        </p>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {Object.values(HOLDS).map((h) => (
            <li key={h} className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2">
              <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
              {h}
            </li>
          ))}
        </ul>
      </Section>

      {/* 8. Savings and cash, from the demo */}
      <Section title="Savings and cash, from the demo">
        {demo.error ? (
          <p className="text-sm text-red-800">Couldn't load the demo figures: {demo.error.message}</p>
        ) : !demo.data ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : (
          <DemoProof data={demo.data} />
        )}
      </Section>

      {/* 9. Say it in one sentence */}
      <figure className="rounded-2xl bg-accent-soft p-6 ring-1 ring-accent/30 sm:p-8">
        <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-ink">Say it in one sentence</figcaption>
        <blockquote className="text-xl font-semibold leading-snug sm:text-2xl">
          “CashBridge lets forwarders pay carriers within hours of a proven delivery without tying up their own cash: the card bill comes due about when the shipper pays.”
        </blockquote>
      </figure>

      <Section title="How it works">
        <div className="space-y-8">
          <Flow />
          <PaymentTimeline />
        </div>
      </Section>
    </div>
  );
}

const pct2 = (part: number, of: number) => `${((part / of) * 100).toFixed(2)}%`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6">
      <h2 className="mb-4 text-xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function WinCard({ who, points, tag, accent = false }: { who: string; points: string[]; tag?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${accent ? 'bg-ink text-white' : tag ? 'bg-accent-soft ring-2 ring-accent' : 'bg-canvas'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{who}</span>
        {tag && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">{tag}</span>}
      </div>
      <ul className={`mt-2 space-y-1.5 text-sm ${accent ? 'text-stone-200' : 'text-stone-700'}`}>
        {points.map((p) => (
          <li key={p} className="flex gap-2"><span aria-hidden className="text-accent">✓</span>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function Point({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="border-l-4 border-accent pl-3">
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-stone-600">{children}</p>
    </li>
  );
}

function ExampleLoad({ detail, error }: { detail?: ShipmentDetail; error?: Error }) {
  if (error) return <p className="text-sm text-red-800">Couldn't load {EXAMPLE_ID}: {error.message}</p>;
  const pay = detail?.payment;
  const s = pay?.settlement;
  if (!detail || !pay || !s) return <p className="text-sm text-stone-500">Loading…</p>;
  const amount = pay.amount_cents;
  const factoring = Math.round((amount * EXAMPLE_FACTORING_PCT) / 100);
  const terms = detail.payer.current_terms_to_carriers_days;
  const carrierShare = Math.round((s.fee_paid_by_carrier_cents / s.total_fee_cents) * 100);

  const rows: { who: string; today: ReactNode; cashbridge: ReactNode }[] = [
    {
      who: 'Forwarder pays',
      today: <>{money(amount)} in {terms} days, after checking the invoice by hand</>,
      cashbridge: <>{money(amount)} plus {money(s.fee_paid_by_payer_cents)} fee share, on its card bill due <strong>{day(pay.statement_due_date)}</strong>, {s.float_days} days later</>,
    },
    {
      who: 'Carrier gets',
      today: <><strong>{money(amount)}</strong> in {terms} days, or <strong>{money(amount - factoring)}</strong> now through factoring (about {EXAMPLE_FACTORING_PCT}%, {money(factoring)})</>,
      cashbridge: <><strong>{money(amount - s.fee_paid_by_carrier_cents)}</strong> about <strong>{s.hours_delivery_to_funds} hours</strong> after delivery (its fee share: {money(s.fee_paid_by_carrier_cents)})</>,
    },
    {
      who: 'Mastercard',
      today: <>Usually nothing: paid by ACH or check</>,
      cashbridge: <>{money(s.network_fee_cents)} network fee; the issuer earns {money(s.interchange_cents)} interchange</>,
    },
  ];

  return (
    <div>
      <p className="mb-3 text-sm text-stone-600">
        <Link to={`/shipments/${EXAMPLE_ID}`} className="font-medium text-accent-ink hover:underline">{EXAMPLE_ID}</Link>: a {money(amount)} invoice.
        CashBridge fee {money(s.total_fee_cents)}, split {carrierShare}/{100 - carrierShare} between carrier and forwarder.
      </p>
      <div className="divide-y divide-stone-100 text-sm">
        <div className="hidden grid-cols-[9rem_1fr_1fr] gap-4 pb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 md:grid">
          <span /><span>Today</span><span className="text-accent-ink">CashBridge</span>
        </div>
        {rows.map((r) => (
          <div key={r.who} className="grid gap-2 py-3 md:grid-cols-[9rem_1fr_1fr] md:gap-4">
            <div className="font-semibold">{r.who}</div>
            <div className="text-stone-600"><span className="font-medium text-stone-500 md:hidden">Today: </span>{r.today}</div>
            <div className="rounded-lg bg-accent-soft px-2 py-1 text-ink md:-my-1"><span className="font-medium text-accent-ink md:hidden">CashBridge: </span>{r.cashbridge}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoProof({ data }: { data: Dashboard }) {
  const t = data.totals;
  const floatValue = t.avg_float_days != null ? Math.round((t.paid_cents * t.avg_float_days * FORWARDER_BORROWING_APR) / 100 / 365) : null;
  const factoring = data.carriers.filter((c) => c.cash_preference === 'factoring');
  const avoided = factoring.reduce((a, c) => a + c.factoring_avoided_cents, 0);
  const fees = factoring.reduce((a, c) => a + c.fees_paid_by_carrier_cents, 0);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-accent-soft p-4 ring-1 ring-accent/30">
          <div className="text-sm font-semibold">Forwarders: cash kept</div>
          <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{money(t.paid_cents)}</div>
          <p className="text-sm text-stone-700">
            paid to carriers within hours on the card, while the forwarders' own cash stayed in their accounts about <strong>{t.avg_float_days ?? '—'} days</strong> on average
          </p>
          {floatValue != null && (
            <p className="mt-2 text-xs text-stone-600">
              Worth about <strong>{money(floatValue)}</strong> in borrowing they don't need (illustrative: at {FORWARDER_BORROWING_APR}% a year, an assumed cost of borrowing).
            </p>
          )}
        </div>
        <div className="rounded-xl bg-canvas p-4">
          <div className="text-sm font-semibold">Carriers that factor: saved</div>
          <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{money(avoided - fees)}</div>
          <p className="text-sm text-stone-700">
            {money(avoided)} of factoring (6–8%) avoided, less {money(fees)} in CashBridge fees
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-stone-600">
        Also: <strong>{Math.round((t.paid / t.shipments) * 100)}%</strong> of {t.shipments} shipments paid automatically, and about{' '}
        <strong>{t.avg_hours_to_funds != null ? Math.round(t.avg_hours_to_funds) : '—'} hours</strong> from proven delivery to the carrier's bank.
      </p>
      <p className="mt-1 text-xs text-stone-500">
        Live from the demo's synthetic shipments; see the <Link to="/cash-flow-hub" className="text-accent-ink hover:underline">Cash Flow Hub</Link>.
      </p>
    </>
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
          <dd className="text-stone-600">Carrier paid by the forwarder in 30–45 days, or pays factoring (6–8%) to get it sooner. Shipper pays the forwarder at 45 days.</dd>
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
          <Marker day={37.5} tone="muted" text="Carrier paid by the forwarder in 30–45 days, or pays factoring (6–8%)" align="end" />
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
