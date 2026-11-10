import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HOLD_REASONS } from '../../../shared/decisions.ts';
import type {
  PaymentHistoryRow, PaymentStatus, PaymentValueRow, PaymentsResponse, VirtualCardStatus,
} from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { InfoTip } from '../InfoTip.tsx';
import { companyName, day, money, when } from '../format.ts';

// ---- Rates: placeholders the viewer can override, kept in this browser only ----

interface Rates { borrowingPct: number; touchUsd: number; processOn: boolean }
const PLACEHOLDERS: Rates = { borrowingPct: 9, touchUsd: 15, processOn: true };
const RATES_KEY = 'cashbridge.payments.rates';

function loadRates(): Rates {
  try {
    const saved = JSON.parse(localStorage.getItem(RATES_KEY) ?? 'null') as Partial<Rates> | null;
    return saved ? { ...PLACEHOLDERS, ...saved } : PLACEHOLDERS;
  } catch {
    return PLACEHOLDERS;
  }
}

function useRates() {
  const [rates, setRates] = useState<Rates>(loadRates);
  useEffect(() => {
    try {
      localStorage.setItem(RATES_KEY, JSON.stringify(rates));
    } catch { /* storage blocked: rates last for this visit only */ }
  }, [rates]);
  return [rates, setRates] as const;
}

// The estimates for one paid load, in cents (unrounded until shown).
function valueOf(r: PaymentValueRow, rates: Rates) {
  const borrowing = (r.amount_cents * r.days_funded * rates.borrowingPct) / 100 / 365;
  const process = rates.processOn && r.automatic ? rates.touchUsd * 100 : 0;
  return { borrowing, process, net: borrowing + process - r.forwarder_fee_cents };
}

const FEE_MODEL_LABELS: Record<string, string> = {
  carrier_pays: 'Carrier pays',
  split: 'Split',
  payer_pays: 'Forwarder pays',
};

const CARD_STATUS: Record<VirtualCardStatus, { label: string; tone: string }> = {
  issued: { label: 'Issued · awaiting delivery', tone: 'bg-stone-100 text-stone-700' },
  authorized: { label: 'Authorized · held for review', tone: 'bg-amber-100 text-amber-900' },
  charged: { label: 'Charged', tone: 'bg-emerald-50 text-emerald-800' },
  cancelled: { label: 'Cancelled', tone: 'bg-red-50 text-red-800' },
};

const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'bg-emerald-50 text-emerald-800' },
  released: { label: 'Released', tone: 'bg-emerald-50 text-emerald-800' },
  held: { label: 'Held', tone: 'bg-amber-100 text-amber-900' },
  blocked: { label: 'Blocked', tone: 'bg-stone-200 text-stone-800' },
  rejected: { label: 'Rejected', tone: 'bg-red-50 text-red-800' },
};

const DEFAULT_PAYER = 'PAY-01';
const shortName = (name: string) => companyName(name).replace(/ (Freight )?(Forwarding|Partners)$/, '');

// The Virtual Card page, for the forwarder's finance and accounts payable team: what the card is worth,
// the card account, the virtual cards and every payment made with them.
export function VirtualCard() {
  const [params, setParams] = useSearchParams();
  const payerId = params.get('payer_id') || DEFAULT_PAYER;
  const { data, error, loading } = useApi<PaymentsResponse>(`/api/payments?payer_id=${encodeURIComponent(payerId)}`);
  const [rates, setRates] = useRates();

  if (error) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Couldn't load the virtual card: {error.message}</p>;
  if (!data) return <p className="text-sm text-stone-500">Loading the virtual card…</p>;

  return (
    <div className={`space-y-8 ${loading ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Mastercard Virtual Card</h1>
          <p className="text-sm text-stone-600">
            Issued by {companyName(data.card_program.issuer)} (fictional) · for {companyName(data.payer.name)}’s finance and AP team
          </p>
          <p className="text-sm text-stone-500">As of {when(data.as_of)}, the end of the sample data</p>
        </div>
        <div role="group" aria-label="Forwarder" className="flex flex-wrap gap-1 rounded-full bg-white p-1 ring-1 ring-stone-200">
          {data.payers.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === payerId}
              onClick={() => setParams({ payer_id: p.id }, { replace: true })}
              className={`rounded-full px-3 py-1 text-sm font-medium ${p.id === payerId ? 'bg-ink text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
              {shortName(p.name)}
            </button>
          ))}
        </div>
      </div>

      <ValueSection data={data} rates={rates} setRates={setRates} />
      <SetupSection data={data} />
    </div>
  );
}

// ---- Section 1 on the page: value gained per transaction ----

function ValueSection({ data, rates, setRates }: { data: PaymentsResponse; rates: Rates; setRates: (r: Rates) => void }) {
  const rows = data.value.rows;
  const totals = useMemo(() => {
    let borrowing = 0, process = 0, fees = 0, days = 0;
    for (const r of rows) {
      const v = valueOf(r, rates);
      borrowing += v.borrowing;
      process += v.process;
      fees += r.forwarder_fee_cents;
      days += r.days_funded;
    }
    return { borrowing, process, fees, net: borrowing + process - fees, avgDays: rows.length ? days / rows.length : 0 };
  }, [rows, rates]);
  const autoCount = rows.filter((r) => r.automatic).length;

  return (
    <section aria-labelledby="value-heading" className="space-y-4">
      <div>
        <h2 id="value-heading" className="text-xl font-bold tracking-tight">Value gained per transaction</h2>
        <p className="mt-1 max-w-3xl text-sm text-stone-600">
          Compared with <strong>paying carriers same day from your own cash</strong> (for example, quick pay). With CashBridge
          the carrier is still paid within hours, but the card funds it until the bill is due. All figures are estimates.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Working capital available now" value={money(data.value.working_capital_now_cents)}
          sub={`carrier payments on the card, not yet due · as of ${day(data.as_of)}`}
          tip="Carrier payments charged to the card on or before the demo’s now whose card bill isn’t due yet. Without the card, this cash would already have left your account." />
        <Stat label="Average days funded per shipment" value={`${totals.avgDays.toFixed(1)} days`}
          sub={`across ${rows.length} paid loads`}
          tip="Days funded by card = card bill due date − date paid to carrier, averaged over paid loads." />
        <Stat label="Borrowing cost avoided" value={money(Math.round(totals.borrowing))}
          sub={`estimate at ${rates.borrowingPct}% a year (${rateTag(rates.borrowingPct, PLACEHOLDERS.borrowingPct)})`}
          tip="Amount × days funded × borrowing rate ÷ 365, summed over paid loads: what borrowing the same cash for the same days would have cost." />
        <Stat label="Net value after fees" value={money(Math.round(totals.net))} emphasis
          sub={`${money(Math.round(totals.borrowing))} borrowing${rates.processOn ? ` + ${money(Math.round(totals.process))} process` : ''} − ${money(totals.fees)} your fee share`}
          tip="Net value = borrowing cost avoided + process savings − your share of the CashBridge fee. An estimate." />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Card-funded working capital outstanding">
          <WorkingCapitalChart series={data.value.series} />
          <p className="mt-2 text-xs text-stone-500">
            Each day: carrier payments charged to the card whose bill isn’t due yet. It drops when a bill is paid (Oct charges, due Nov 15).
          </p>
        </Card>
        <RatesPanel rates={rates} setRates={setRates} autoCount={autoCount} />
      </div>

      <ValueTable rows={rows} rates={rates} customerTerms={data.payer.customer_terms_days} />

      <p className="text-xs text-stone-500">
        Against today’s net-30 terms, your cash stays put only about 2 days longer (the card bill is due about 32 days after the
        carrier is paid, versus 30 today); the gain is paying carriers same day without using your own cash. Process savings count
        loads paid automatically, with no manual match. Estimates on synthetic data with illustrative pricing.
      </p>
    </section>
  );
}

const rateTag = (value: number, placeholder: number) => (value === placeholder ? 'placeholder' : 'your rate');

function RatesPanel({ rates, setRates, autoCount }: { rates: Rates; setRates: (r: Rates) => void; autoCount: number }) {
  const isPlaceholder = rates.borrowingPct === PLACEHOLDERS.borrowingPct && rates.touchUsd === PLACEHOLDERS.touchUsd && rates.processOn;
  const num = (v: string, fallback: number) => (v === '' || !Number.isFinite(Number(v)) ? fallback : Math.max(0, Number(v)));
  return (
    <Card title="Rates">
      <div className="space-y-4 text-sm">
        <label className="block">
          <span className="flex items-center justify-between gap-2">
            <span className="font-medium">Borrowing rate</span>
            <Tag>{rateTag(rates.borrowingPct, PLACEHOLDERS.borrowingPct)}</Tag>
          </span>
          <span className="mt-1 flex items-center gap-2">
            <input type="number" min={0} max={50} step={0.25} value={rates.borrowingPct}
              onChange={(e) => setRates({ ...rates, borrowingPct: num(e.target.value, 0) })}
              className="w-24 rounded-lg border border-stone-300 px-2 py-1 tabular-nums focus:outline-2 focus:outline-accent" />
            <span className="text-stone-600">% a year (your credit line or cost of capital)</span>
          </span>
        </label>
        <div>
          <span className="flex items-center justify-between gap-2">
            <label htmlFor="touch" className="font-medium">Cost per manual touch</label>
            <Tag>{rates.processOn ? rateTag(rates.touchUsd, PLACEHOLDERS.touchUsd) : 'off'}</Tag>
          </span>
          <span className="mt-1 flex items-center gap-2">
            <span className="text-stone-600">$</span>
            <input id="touch" type="number" min={0} max={500} step={1} value={rates.touchUsd} disabled={!rates.processOn}
              onChange={(e) => setRates({ ...rates, touchUsd: num(e.target.value, 0) })}
              className="w-24 rounded-lg border border-stone-300 px-2 py-1 tabular-nums focus:outline-2 focus:outline-accent disabled:bg-stone-100 disabled:text-stone-400" />
            <span className="text-stone-600">per load matched by hand</span>
          </span>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={rates.processOn} onChange={(e) => setRates({ ...rates, processOn: e.target.checked })}
              className="h-4 w-4 accent-accent" />
            <span>Count process savings ({autoCount} loads paid automatically)</span>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 text-xs text-stone-500">
          <span>Saved in this browser only.</span>
          <button type="button" disabled={isPlaceholder} onClick={() => setRates(PLACEHOLDERS)}
            className="font-medium text-accent-ink hover:underline disabled:text-stone-400 disabled:no-underline">
            Reset to placeholders
          </button>
        </div>
      </div>
    </Card>
  );
}

const PAGE = 15;

function ValueTable({ rows, rates, customerTerms }: { rows: PaymentValueRow[]; rates: Rates; customerTerms: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.card_charge_ts.localeCompare(a.card_charge_ts) || a.shipment_id.localeCompare(b.shipment_id)), [rows]);
  const shown = all ? sorted : sorted.slice(0, PAGE);
  return (
    <Card title={`Per shipment · ${rows.length} paid loads, newest first`}>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-1.5 pr-3"><span className="sr-only">Details</span></th>
              <th className="py-1.5 pr-3">Shipment</th>
              <th className="py-1.5 pr-3">Carrier</th>
              <th className="py-1.5 pr-3 text-right">Payment</th>
              <th className="py-1.5 pr-3">Paid to carrier</th>
              <th className="py-1.5 pr-3">Card bill due</th>
              <th className="py-1.5 pr-3">Customer pays (est.)</th>
              <th className="py-1.5 pr-3 text-right">Days funded</th>
              <th className="py-1.5 pr-3 text-right">Borrowing avoided</th>
              <th className="py-1.5 pr-3 text-right">Your fee share</th>
              <th className="py-1.5 text-right">Net value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {shown.map((r) => {
              const v = valueOf(r, rates);
              const isOpen = open === r.shipment_id;
              return (
                <Fragment key={r.shipment_id}>
                  <tr className={isOpen ? 'bg-canvas' : undefined}>
                    <td className="py-2 pr-3">
                      <button type="button" aria-expanded={isOpen} aria-label={`Show the formula for ${r.shipment_id}`}
                        onClick={() => setOpen(isOpen ? null : r.shipment_id)}
                        className="grid h-6 w-6 place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-ink">
                        <span aria-hidden className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 font-semibold">
                      <Link to={`/shipments/${r.shipment_id}`} className="text-accent-ink hover:underline">{r.shipment_id}</Link>
                      {!r.automatic && <span className="ml-1.5 text-xs font-normal text-stone-500">released</span>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-stone-600">{companyName(r.carrier_name)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{money(r.amount_cents)}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{day(r.paid_to_carrier_ts)}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{day(r.statement_due_date)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-stone-600">{day(r.expected_customer_payment_date)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{r.days_funded}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{money(Math.round(v.borrowing))}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{money(r.forwarder_fee_cents)}</td>
                    <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums">{money(Math.round(v.net))}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-canvas">
                      <td />
                      <td colSpan={10} className="pb-3 pr-3 text-xs text-stone-700">
                        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                          <dt className="font-medium">Days funded</dt>
                          <dd>card bill due {day(r.statement_due_date)} − paid to carrier {day(r.paid_to_carrier_ts)} = <strong>{r.days_funded} days</strong></dd>
                          <dt className="font-medium">Borrowing cost avoided</dt>
                          <dd>{money(r.amount_cents)} × {r.days_funded} days × {rates.borrowingPct}% ÷ 365 = <strong>{money(Math.round(v.borrowing))}</strong> ({rateTag(rates.borrowingPct, PLACEHOLDERS.borrowingPct)})</dd>
                          <dt className="font-medium">Process savings</dt>
                          <dd>{!rates.processOn ? 'turned off' : r.automatic ? <>paid automatically: 1 touch × ${rates.touchUsd} = <strong>{money(v.process)}</strong></> : 'released after review, so it was touched by hand: $0'}</dd>
                          <dt className="font-medium">Net value</dt>
                          <dd>{money(Math.round(v.borrowing))} + {money(v.process)} − {money(r.forwarder_fee_cents)} fee share = <strong>{money(Math.round(v.net))}</strong></dd>
                          <dt className="font-medium">Customer pays (est.)</dt>
                          <dd>delivery + your {customerTerms}-day customer terms; shown for context, not in the formula</dd>
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > PAGE && (
        <button type="button" onClick={() => setAll(!all)} className="mt-3 text-sm font-medium text-accent-ink hover:underline">
          {all ? 'Show fewer' : `Show all ${sorted.length}`}
        </button>
      )}
    </Card>
  );
}

// One series, so no legend: a 2px line over a light wash, a hairline crosshair with a tooltip,
// and the latest value labeled at the end.
function WorkingCapitalChart({ series }: { series: PaymentsResponse['value']['series'] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!box.current) return;
    // Measure now (so the first paint fits), then follow resizes.
    setWidth(Math.max(260, box.current.clientWidth));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  if (series.length < 2) return <p className="text-sm text-stone-500">Not enough payments to chart.</p>;

  const height = 220;
  const pad = { top: 16, right: 16, bottom: 26, left: 52 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const max = Math.max(...series.map((s) => s.outstanding_cents));
  const step = niceStep(max / 4);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const x = (i: number) => pad.left + (i / (series.length - 1)) * w;
  const y = (c: number) => pad.top + h - (c / top) * h;
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.outstanding_cents).toFixed(1)}`).join('');
  const area = `${line}L${x(series.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  // x labels: the first of each month and the 15th, when there's room.
  const xTicks = series.map((s, i) => ({ s, i })).filter(({ s }) => s.date.endsWith('-01') || (width > 480 && s.date.endsWith('-15')));
  const last = series.length - 1;
  const hv = hover != null ? series[hover] : null;

  const onMove = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const i = Math.round(((clientX - rect.left - pad.left) / w) * (series.length - 1));
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <div ref={box} className="relative overflow-hidden">
      <svg width={width} height={height} role="img" className="block touch-pan-y select-none"
        aria-label={`Card-funded working capital outstanding, ${day(series[0].date)} to ${day(series[last].date)}. Peak ${compact(max)}; now ${compact(series[last].outstanding_cents)}.`}
        onPointerMove={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-stone-500 text-[11px] tabular-nums">{compact(t)}</text>
          </g>
        ))}
        {xTicks.map(({ s, i }) => (
          <text key={s.date} x={x(i)} y={height - 6} textAnchor="middle" className="fill-stone-500 text-[11px]">{shortDay(s.date)}</text>
        ))}
        <path d={area} fill="#ff5f00" fillOpacity={0.1} />
        <path d={line} fill="none" stroke="#ff5f00" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last)} cy={y(series[last].outstanding_cents)} r={4} fill="#ff5f00" stroke="#fff" strokeWidth={2} />
        {hv && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.top} y2={y(0)} stroke="#141413" strokeWidth={1} />
            <circle cx={x(hover!)} cy={y(hv.outstanding_cents)} r={4} fill="#ff5f00" stroke="#fff" strokeWidth={2} />
          </>
        )}
      </svg>
      <span className="pointer-events-none absolute right-4 top-0 text-xs text-stone-600">
        Now <strong className="tabular-nums text-ink">{money(series[last].outstanding_cents)}</strong>
      </span>
      {hv && (
        <div className="pointer-events-none absolute top-6 rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-md ring-1 ring-stone-200"
          style={{ left: Math.min(Math.max(x(hover!) - 70, 0), width - 150), width: 150 }}>
          <div className="font-semibold tabular-nums text-ink">{money(hv.outstanding_cents)}</div>
          <div className="text-stone-500">{day(hv.date)}</div>
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 100_000; // $1,000 in cents
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
}
const compact = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100);
const shortDay = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

// ---- Section 2 on the page: payment setup and account ----

function SetupSection({ data }: { data: PaymentsResponse }) {
  return (
    <section aria-labelledby="setup-heading" className="space-y-4">
      <div>
        <h2 id="setup-heading" className="text-xl font-bold tracking-tight">Payment setup and account</h2>
        <p className="mt-1 text-sm text-stone-600">
          Pre-configured for the demo and simulated. Settings are shown read-only: nothing here changes a payment decision.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SetupSummary data={data} />
        <CardProgram data={data} />
        <Terms data={data} />
      </div>
      <VirtualCards data={data} />
      <History data={data} />
    </section>
  );
}

function setupSteps(data: PaymentsResponse): { title: string; body: ReactNode }[] {
  const { payer, setup, card_program: c } = data;
  return [
    {
      title: 'Company and admins',
      body: (
        <dl className="space-y-1">
          <Row k="Company" v={companyName(payer.name)} />
          <Row k="Service level" v={payer.service_level === 'full' ? 'Full forwarding' : 'Brokerage only'} />
          <Row k="Admins" v={setup.admins.join('; ')} />
        </dl>
      ),
    },
    {
      title: 'Card program',
      body: (
        <dl className="space-y-1">
          <Row k="Issuer" v={companyName(c.issuer)} />
          <Row k="Card" v="Commercial virtual card, one single-use card per shipment" />
          <Row k="Credit limit" v={money(c.credit_limit_cents)} />
          <Row k="Statement" v={`Closes at month-end; due ${payer.grace_days} days later`} />
        </dl>
      ),
    },
    {
      title: 'Payout method',
      body: (
        <dl className="space-y-1">
          <Row k="Method" v={setup.payout_method} />
          <Row k="Timing target" v="Carrier funded within 24 hours of confirmed delivery (4–20 hours in the sample)" />
        </dl>
      ),
    },
    {
      title: 'Payment rules',
      body: (
        <div className="space-y-2">
          <dl className="space-y-1">
            <Row k="Approved range" v={`Booked rate + fuel, up to +${setup.approved_range_tolerance_pct}%`} />
            <Row k="Auto-pay" v={`At confirmed delivery: card charged ${setup.charge_delay_hours} hour after delivery`} />
          </dl>
          <p className="font-medium">{setup.hold_rules.length} hold rules, all on:</p>
          <ol className="list-decimal space-y-0.5 pl-5 text-stone-600">
            {setup.hold_rules.map((r) => <li key={r}>{HOLD_REASONS[r]}</li>)}
          </ol>
        </div>
      ),
    },
    {
      title: 'Fee model',
      body: (
        <dl className="space-y-1">
          <Row k="Model" v={FEE_MODEL_LABELS[payer.fee_model] ?? payer.fee_model} />
          <Row k="Fee" v={`${setup.fee_split.total_fee_pct}% of each payment (illustrative)`} />
          <Row k="Split" v={`Carrier ${setup.fee_split.carrier_pct}% · you ${setup.fee_split.forwarder_pct}%`} />
        </dl>
      ),
    },
  ];
}

function SetupSummary({ data }: { data: PaymentsResponse }) {
  const steps = setupSteps(data);
  const [step, setStep] = useState<number | null>(null);
  const { setup, payer } = data;
  if (step != null) {
    const s = steps[step];
    return (
      <Card title={`Setup · step ${step + 1} of ${steps.length}`}>
        <ol className="mb-3 flex gap-1" aria-hidden>
          {steps.map((_, i) => <li key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-accent-soft'}`} />)}
        </ol>
        <h3 className="font-semibold">{s.title}</h3>
        <div className="mt-2 text-sm">{s.body}</div>
        <p className="mt-3 text-xs text-stone-500">Simulated · read-only</p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-stone-100 pt-3 text-sm">
          <button type="button" onClick={() => setStep(step === 0 ? null : step - 1)} className="font-medium text-stone-600 hover:text-ink">
            {step === 0 ? 'Close' : 'Back'}
          </button>
          <button type="button" onClick={() => setStep(step === steps.length - 1 ? null : step + 1)}
            className="rounded-full bg-ink px-4 py-1.5 font-semibold text-white hover:bg-stone-800">
            {step === steps.length - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </Card>
    );
  }
  return (
    <Card title="Setup">
      <ul className="space-y-2 text-sm">
        <Check>Company and admins: {setup.admins.length} admins</Check>
        <Check>Card program: {money(data.card_program.credit_limit_cents)} limit, closes month-end, due {payer.grace_days} days later</Check>
        <Check>Payout: card-to-account to the verified bank account</Check>
        <Check>Rules: approved range +{setup.approved_range_tolerance_pct}%, {setup.hold_rules.length} hold rules on, auto-pay at confirmed delivery</Check>
        <Check>Fee model: {FEE_MODEL_LABELS[payer.fee_model] ?? payer.fee_model}</Check>
      </ul>
      <button type="button" onClick={() => setStep(0)}
        className="mt-4 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white hover:bg-stone-800">
        View setup
      </button>
      <p className="mt-2 text-xs text-stone-500">Pre-configured and simulated · read-only</p>
    </Card>
  );
}

function CardProgram({ data }: { data: PaymentsResponse }) {
  const c = data.card_program;
  const used = c.credit_limit_cents ? Math.min(100, (c.statement_balance_cents / c.credit_limit_cents) * 100) : 0;
  return (
    <Card title="Card program">
      <p className="text-sm text-stone-600">{companyName(c.issuer)} · as of {day(data.as_of)}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Row k="Credit limit" v={money(c.credit_limit_cents)} />
        <Row k="Current statement balance" v={money(c.statement_balance_cents)} />
        <Row k="Available credit" v={<strong>{money(c.available_credit_cents)}</strong>} />
      </dl>
      <div className="mt-2 h-2 rounded-full bg-accent-soft" role="img" aria-label={`${used.toFixed(0)}% of the credit limit used`}>
        <div className="h-2 rounded-full bg-accent" style={{ width: `${used}%` }} />
      </div>
      <p className="mt-1 text-xs text-stone-500">{used.toFixed(0)}% of the limit used</p>
      <dl className="mt-3 space-y-1.5 border-t border-stone-100 pt-3 text-sm">
        <Row k="Statement closes" v={day(c.statement_closes)} />
        <Row k="Payment due" v={day(c.statement_due)} />
        {c.last_statement && (
          <Row k="Last statement" v={`${money(c.last_statement.total_cents)}, due ${day(c.last_statement.due)}${c.last_statement.paid ? ', paid' : ''}`} />
        )}
      </dl>
      <p className="mt-2 text-xs text-stone-500">Balance = carrier payments this cycle + your fee share. Simulated.</p>
    </Card>
  );
}

function Terms({ data }: { data: PaymentsResponse }) {
  const { terms, setup, payer } = data;
  return (
    <Card title="Terms of service">
      <p className="text-sm text-stone-600">Plain-language summary · version {terms.version}</p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
        <li><strong>Fees:</strong> {setup.fee_split.total_fee_pct}% of each payment; under {FEE_MODEL_LABELS[payer.fee_model]?.toLowerCase() ?? payer.fee_model} you pay {setup.fee_split.forwarder_pct}% of it.</li>
        <li><strong>Statement:</strong> closes the last day of each month; due {payer.grace_days} days later.</li>
        <li><strong>Payout timing:</strong> the carrier is funded within 24 hours of confirmed delivery (target).</li>
        <li><strong>Disputes:</strong> raise a dispute within 60 days of the statement date.</li>
        <li><strong>Held payments:</strong> the card is authorized but not charged until you release it; if you reject it, the card is cancelled and nothing is charged.</li>
      </ul>
      <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
        Accepted by {terms.accepted_by} on {day(terms.accepted_on)}. Simulated.
      </p>
    </Card>
  );
}

function VirtualCards({ data }: { data: PaymentsResponse }) {
  const [status, setStatus] = useState<VirtualCardStatus | ''>('');
  const [all, setAll] = useState(false);
  const counts = useMemo(() => {
    const m = { issued: 0, authorized: 0, charged: 0, cancelled: 0 } as Record<VirtualCardStatus, number>;
    for (const c of data.cards) m[c.status] += 1;
    return m;
  }, [data.cards]);
  const filtered = data.cards.filter((c) => !status || c.status === status)
    .sort((a, b) => b.issued_ts.localeCompare(a.issued_ts));
  const shown = all ? filtered : filtered.slice(0, PAGE);
  return (
    <Card title={`Virtual cards · one per shipment · ${data.cards.length}`}>
      <div role="group" aria-label="Card status" className="mb-3 flex flex-wrap gap-1.5 text-sm">
        {(['', 'issued', 'authorized', 'charged', 'cancelled'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => { setStatus(s); setAll(false); }}
            className={`rounded-full px-3 py-1 font-medium ring-1 ${status === s ? 'bg-ink text-white ring-ink' : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-100'}`}>
            {s ? `${CARD_STATUS[s].label.split(' · ')[0]} ${counts[s]}` : `All ${data.cards.length}`}
          </button>
        ))}
      </div>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-1.5 pr-3">Card</th><th className="py-1.5 pr-3">Shipment</th><th className="py-1.5 pr-3">Carrier</th>
              <th className="py-1.5 pr-3 text-right">Approved range</th><th className="py-1.5 pr-3">Status</th>
              <th className="py-1.5 pr-3">Issued</th><th className="py-1.5">Expires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {shown.map((c) => (
              <tr key={c.shipment_id}>
                <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs">•••• {c.card_last4}</td>
                <td className="whitespace-nowrap py-2 pr-3 font-semibold">
                  <Link to={`/shipments/${c.shipment_id}`} className="text-accent-ink hover:underline">{c.shipment_id}</Link>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-stone-600">{companyName(c.carrier_name)}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{money(c.min_cents)} – {money(c.max_cents)}</td>
                <td className="whitespace-nowrap py-2 pr-3"><Badge tone={CARD_STATUS[c.status].tone}>{CARD_STATUS[c.status].label}</Badge></td>
                <td className="whitespace-nowrap py-2 pr-3">{day(c.issued_ts)}</td>
                <td className="whitespace-nowrap py-2">{day(c.expires_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > PAGE && (
        <button type="button" onClick={() => setAll(!all)} className="mt-3 text-sm font-medium text-accent-ink hover:underline">
          {all ? 'Show fewer' : `Show all ${filtered.length}`}
        </button>
      )}
      <p className="mt-3 text-xs text-stone-500">
        Each card is issued when the load is booked, limited to the approved range (booked rate + fuel, up to +{data.setup.approved_range_tolerance_pct}%),
        and used once. It expires {data.setup.card_expiry_days} days after the scheduled delivery, leaving room for a late delivery, a review and a dispute.
        Simulated card numbers.
      </p>
    </Card>
  );
}

interface HistoryFilters { from: string; to: string; carrier: string; status: string; lane: string }
const NO_FILTERS: HistoryFilters = { from: '', to: '', carrier: '', status: '', lane: '' };
const historyDate = (h: PaymentHistoryRow) => (h.delivered_ts ?? h.decided_ts ?? '').slice(0, 10);

function History({ data }: { data: PaymentsResponse }) {
  const [f, setF] = useState<HistoryFilters>(NO_FILTERS);
  const [all, setAll] = useState(false);
  const rows = useMemo(() => data.history
    .filter((h) => (!f.from || historyDate(h) >= f.from) && (!f.to || historyDate(h) <= f.to)
      && (!f.carrier || h.carrier_id === f.carrier) && (!f.status || h.status === f.status) && (!f.lane || h.lane === f.lane))
    .sort((a, b) => historyDate(b).localeCompare(historyDate(a)) || a.key.localeCompare(b.key)), [data.history, f]);
  const shown = all ? rows : rows.slice(0, PAGE);
  const set = (k: keyof HistoryFilters) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setAll(false); };
  const field = 'mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm focus:outline-2 focus:outline-accent';

  return (
    <Card title={`Payment history · ${rows.length} of ${data.history.length}`}>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_auto_1fr_auto]">
        <label className="text-xs text-stone-600">Delivered from<input type="date" value={f.from} onChange={set('from')} className={field} /></label>
        <label className="text-xs text-stone-600">to<input type="date" value={f.to} onChange={set('to')} className={field} /></label>
        <label className="min-w-0 text-xs text-stone-600">Carrier
          <select value={f.carrier} onChange={set('carrier')} className={field}>
            <option value="">All carriers</option>
            {data.carriers.map((c) => <option key={c.id} value={c.id}>{companyName(c.name)}</option>)}
          </select>
        </label>
        <label className="text-xs text-stone-600">Status
          <select value={f.status} onChange={set('status')} className={field}>
            <option value="">All statuses</option>
            {(Object.keys(PAYMENT_STATUS) as PaymentStatus[]).map((s) => <option key={s} value={s}>{PAYMENT_STATUS[s].label}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs text-stone-600">Lane
          <select value={f.lane} onChange={set('lane')} className={field}>
            <option value="">All lanes</option>
            {data.lanes.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => exportCsv(rows, data)}
            className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white hover:bg-stone-800">Export CSV</button>
          {f !== NO_FILTERS && (
            <button type="button" onClick={() => setF(NO_FILTERS)} className="py-1.5 text-sm font-medium text-accent-ink hover:underline">Clear</button>
          )}
        </div>
      </div>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-1.5 pr-3">Shipment</th><th className="py-1.5 pr-3">Carrier</th><th className="py-1.5 pr-3">Delivered</th>
              <th className="py-1.5 pr-3">Card charged</th><th className="py-1.5 pr-3">Funds received</th>
              <th className="py-1.5 pr-3 text-right">Amount</th><th className="py-1.5 pr-3 text-right">Fee (yours)</th>
              <th className="py-1.5 pr-3">Status</th><th className="py-1.5">Hold reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {shown.map((h) => (
              <tr key={h.key}>
                <td className="whitespace-nowrap py-2 pr-3 font-semibold">
                  <Link to={`/shipments/${h.shipment_id}`} className="text-accent-ink hover:underline">{h.shipment_id}</Link>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-stone-600">{companyName(h.carrier_name)}</td>
                <td className="whitespace-nowrap py-2 pr-3">{h.delivered_ts ? when(h.delivered_ts) : 'Not delivered'}</td>
                <td className="whitespace-nowrap py-2 pr-3">{h.card_charge_ts ? when(h.card_charge_ts) : '—'}</td>
                <td className="whitespace-nowrap py-2 pr-3">{h.funds_received_ts ? when(h.funds_received_ts) : '—'}</td>
                <td className={`whitespace-nowrap py-2 pr-3 text-right tabular-nums ${h.card_charge_ts ? '' : 'text-stone-500'}`}>{money(h.amount_cents)}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                  {h.fee_cents == null ? '—' : <>{money(h.fee_cents)} <span className="text-stone-500">({money(h.forwarder_fee_cents)})</span></>}
                </td>
                <td className="whitespace-nowrap py-2 pr-3"><Badge tone={PAYMENT_STATUS[h.status].tone}>{PAYMENT_STATUS[h.status].label}</Badge></td>
                <td className="min-w-48 py-2 text-stone-600">{h.reasons.map((r) => HOLD_REASONS[r]).join('; ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-4 text-sm text-stone-500">No payments match these filters.</p>}
      </div>
      {rows.length > PAGE && (
        <button type="button" onClick={() => setAll(!all)} className="mt-3 text-sm font-medium text-accent-ink hover:underline">
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
      <p className="mt-3 text-xs text-stone-500">
        Amounts in grey were not charged: the invoice total of a held, rejected or blocked payment. A blocked row is a duplicate
        invoice; the original was paid once. Released payments are charged at the demo’s now.
      </p>
    </Card>
  );
}

function exportCsv(rows: PaymentHistoryRow[], data: PaymentsResponse) {
  const cents = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2));
  const header = ['shipment_id', 'carrier', 'lane', 'delivered_at', 'card_charged_at', 'funds_received_at', 'amount_usd', 'fee_usd', 'your_fee_share_usd', 'status', 'hold_reasons'];
  const lines = rows.map((h) => [
    h.shipment_id, companyName(h.carrier_name), h.lane, h.delivered_ts ?? '', h.card_charge_ts ?? '', h.funds_received_ts ?? '',
    cents(h.amount_cents), cents(h.fee_cents), cents(h.forwarder_fee_cents), h.status, h.reasons.join(';'),
  ]);
  const csv = [header, ...lines].map((l) => l.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cashbridge-virtual-card-payments-${data.payer.payer_id}-${data.as_of.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Small pieces ----

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, tip, emphasis }: { label: string; value: string; sub: string; tip: ReactNode; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm ring-1 ${emphasis ? 'bg-ink text-white ring-ink' : 'bg-white ring-stone-200'}`}>
      <div className={`text-sm ${emphasis ? 'text-stone-300' : 'text-stone-600'}`}>{label}<InfoTip label={label}>{tip}</InfoTip></div>
      <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className={`mt-1 text-xs ${emphasis ? 'text-stone-300' : 'text-stone-500'}`}>{sub}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4">
      <dt className="text-stone-600">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-ink">✓</span>
      <span>{children}</span>
    </li>
  );
}

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{children}</span>;
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">{children}</span>;
}
