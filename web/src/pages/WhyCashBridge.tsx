import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { HoldReason } from '../../../shared/decisions.ts';
import type { Dashboard, ShipmentDetail } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { day, money } from '../format.ts';

// The Why CashBridge page: the value in about a minute, for readers who don't know freight, told from the
// forwarder's side first (the assumed primary buyer), then the carrier's. Order: the one-line pitch, the problem,
// what CashBridge does, one load today vs CashBridge, how it works, why it's safer, and who wins, then links to the live figures.
// Example-load and automatic-payment figures come live from the API; 30–45 days and 6–8% are from the Mastercard white paper.

const EXAMPLE_ID = 'SHP-10001';
const EXAMPLE_FACTORING_PCT = 7; // the middle of the white paper's 6–8%
// Staff time to match, approve and pay one carrier invoice by hand: a placeholder, not sourced (the build plan's
// $15 per manual touch, also used on the Virtual Card page).
const HANDLING_COST_CENTS = 1500;

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

// Each step today (separate tools, manual handoffs) next to what CashBridge does instead. The engine is
// rules-based today; AI is the next step (learning from reviewers' decisions), so it's marked roadmap.
const COMPARISON: { step: string; today: string; cashbridge: string; title: string; next?: boolean }[] = [
  { step: 'Prove delivery', today: 'A tracking tool; proof of delivery emailed or chased by hand', title: 'Authenticated shipment', cashbridge: 'GPS, RFID, signature or photo prove the load was delivered, to the right place' },
  { step: 'Check the invoice', today: 'Checked by hand, often days later', title: 'Automated decisioning', cashbridge: 'Every invoice checked against 8 rules in seconds; most paid with no one involved' },
  { step: 'Pay the carrier', today: 'A payment run 30–45 days later, by ACH or check', title: 'Instant payment', cashbridge: 'Card charge and payout to the carrier’s bank within hours of proven delivery' },
  { step: 'Get cash sooner', today: 'The carrier pays factoring (6–8%)', title: 'No factoring needed', cashbridge: 'The carrier is already paid; the forwarder’s card covers the gap' },
  { step: 'Get smarter', today: 'Nothing learns from past decisions', title: 'AI, next', cashbridge: 'Learn from reviewers’ decisions to spot fraud earlier and cut false holds', next: true },
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
      {/* The line to repeat, first */}
      <header className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Why CashBridge</h1>
        <figure className="rounded-2xl bg-accent-soft p-6 ring-1 ring-accent/30 sm:p-8">
          <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-ink">In one sentence</figcaption>
          <blockquote className="text-xl font-semibold leading-snug sm:text-2xl">
            “CashBridge lets forwarders pay carriers within hours of a proven delivery without tying up their own cash.”
          </blockquote>
        </figure>
        <p className="text-sm text-stone-500">
          Written for the forwarder (freight forwarder or broker), our <strong>assumed primary buyer</strong>. Carriers are the second audience.
        </p>
      </header>

      {/* 1. The problem: the forwarder's cash gap first, the carrier's wait second, and today's pieced-together tools */}
      <Section title="The problem">
        <p className="max-w-3xl text-lg leading-relaxed text-stone-700">
          Shippers pay the forwarder in <strong>{shipperTerms} days</strong>, but the forwarder pays its carriers in about{' '}
          <strong>{carrierTerms} days</strong>. So on every load the forwarder's own cash is tied up for weeks: money it needs to run the
          business, make payroll, grow and take on more loads.
        </p>
        <p className="mt-3 max-w-3xl leading-relaxed text-stone-600">
          The other side of the same problem: truckers (carriers) wait 30–45 days to get paid. To get money sooner, small carriers use{' '}
          <strong>factoring</strong>: they sell the invoice to a finance company, which pays now but keeps <strong>6–8%</strong>.
        </p>
        <h3 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-stone-500">Today it's pieced together</h3>
        <div className="overflow-hidden rounded-2xl ring-1 ring-stone-200">
          <div className="hidden grid-cols-[10rem_1fr_1fr] text-xs font-semibold uppercase tracking-wide md:grid">
            <div className="bg-stone-50 px-4 py-2 text-stone-500">Step</div>
            <div className="bg-stone-50 px-4 py-2 text-stone-500">Today: separate tools</div>
            <div className="bg-accent-soft px-4 py-2 text-accent-ink">CashBridge: one flow</div>
          </div>
          {COMPARISON.map((row) => (
            <div key={row.step} className="grid border-t border-stone-200 first:border-t-0 md:grid-cols-[10rem_1fr_1fr] md:first:border-t">
              <div className="bg-stone-50 px-4 pt-3 text-sm font-semibold md:py-3">{row.step}</div>
              <div className="bg-stone-50 px-4 py-2 text-sm text-stone-500 md:bg-white md:py-3">
                <span className="font-semibold text-stone-400 md:hidden">Today: </span>{row.today}
              </div>
              <div className="bg-accent-soft px-4 py-3 text-sm">
                <span className="font-semibold">{row.title}</span>
                {row.next && <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-ink ring-1 ring-accent/40">roadmap</span>}
                <span className="block text-stone-700">{row.cashbridge}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-stone-700">
          Today these are separate tools with manual handoffs, and nothing ties the payment to proof of delivery for both the forwarder and
          the carrier.
        </p>
      </Section>

      {/* 2. What CashBridge does */}
      <div className="rounded-2xl bg-ink p-6 text-lg leading-relaxed text-white sm:text-xl">
        <span className="font-semibold text-accent">What CashBridge does: </span>
        once delivery is proven, it checks the invoice automatically and pays the carrier with the forwarder's virtual card, so the carrier
        has its money <strong>within hours</strong>. The forwarder pays the card bill about a month later, so its own cash{' '}
        <strong>stays in its account</strong> meanwhile.
      </div>

      {/* 3. The solution, on one load */}
      <Section title="One load, today vs CashBridge">
        <ExampleLoad detail={example.data} error={example.error} />
      </Section>

      {/* 4. The flow */}
      <Section title="How it works">
        <div className="space-y-8">
          <Flow />
          <PaymentTimeline />
        </div>
      </Section>

      {/* 5. Safer and more secure */}
      <Section title="Safer and more secure">
        <p className="text-stone-700">
          Money moves <strong>only after proven delivery</strong>: an RFID scan at the dock, a signature or a photo. Each load has its own
          single-use virtual card, capped at the approved amount, and the payout goes only to the carrier's verified bank account.
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

      {/* 6. Who wins, including why it matters for Mastercard */}
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
        <h3 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-stone-500">Why it matters for Mastercard</h3>
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
        <MarketSize />
      </Section>

      {/* See it live: the figures are in the demo's own pages */}
      <p className="text-center text-stone-600">
        See it live: the <Link to="/cash-flow-hub" className="font-semibold text-accent-ink hover:underline">Cash Flow Hub</Link> (operations)
        and the <Link to="/virtual-card" className="font-semibold text-accent-ink hover:underline">Virtual Card</Link> (value to the forwarder).
      </p>
    </div>
  );
}

// How big the opportunity is. US broker and 3PL payments to carriers = gross revenue minus net revenue for the
// domestic transportation management segment (Armstrong & Associates, 2025): $128.3B - $19.6B ≈ $109B, an estimate
// (the segment also includes some intermodal and dedicated moves). No public figure gives the share paid by card
// today, so the box quotes the check share from Mastercard's own white paper instead of guessing.
const MARKET_FLOW_BILLIONS = 128.3 - 19.6;

function MarketSize() {
  const flow = Math.round(MARKET_FLOW_BILLIONS);
  const perPoint = (MARKET_FLOW_BILLIONS / 100).toFixed(1);
  const link = 'text-stone-600 underline decoration-stone-300 hover:text-accent-ink';
  return (
    <div className="mt-6 rounded-xl bg-canvas p-4 sm:p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">How big is this?</h3>
      <p className="mt-2 text-stone-700">
        Freight and logistics companies spend <strong>more than US$4 trillion</strong> a year, by Mastercard’s own white paper.
        CashBridge starts with one slice of it: what US brokers and 3PLs pay their trucking carriers.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-3xl font-bold tracking-tight tabular-nums">~${flow}B</div>
          <p className="text-sm text-stone-700">a year from US brokers and 3PLs to the carriers that haul their freight (estimate)</p>
        </div>
        <div>
          <div className="text-3xl font-bold tracking-tight tabular-nums">~60%</div>
          <p className="text-sm text-stone-700">of freight brokers still use paper checks</p>
        </div>
        <div>
          <div className="text-3xl font-bold tracking-tight tabular-nums">${perPoint}B</div>
          <p className="text-sm text-stone-700">in new card volume for every 1% of that flow moved onto card</p>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-stone-500">
        Sources: US$4 trillion: McKinsey Payments Map &amp; Research 2023, as cited in Mastercard, “Transforming freight payments
        for efficiency and growth” (June 2025). ${flow}B is gross minus net revenue of US domestic transportation management 3PLs in 2025 ($128.3B − $19.6B),{' '}
        <a href="https://www.3plogistics.com/3pl-market-info-resources/3pl-market-information/us-3pl-market-size-estimates/" target="_blank" rel="noreferrer" className={link}>Armstrong &amp; Associates</a>;
        brokerage is about 83% of it (about $90B). International forwarding is left out. Check share: Denim, Freight Broker Pulse Report 2022,
        as cited in the same white paper. No public figure reports the share paid by card today.
      </p>
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
  const automatic = detail.decision?.settlement != null; // paid with no one involved

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
      who: 'Handling cost',
      today: <>About <strong>{money(HANDLING_COST_CENTS)}</strong> of the forwarder's staff time to match, approve and pay the invoice by hand (placeholder)</>,
      cashbridge: automatic
        ? <><strong>{money(0)}</strong>: matched to the shipment, checked and paid automatically</>
        : <>Still {money(HANDLING_COST_CENTS)}: this load was held and reviewed by hand</>,
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
