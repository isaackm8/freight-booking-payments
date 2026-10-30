import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HOLD_REASONS } from '../../../shared/decisions.ts';
import type { Dashboard as DashboardData } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { InfoTip } from '../InfoTip.tsx';
import { CarrierCosts } from '../CarrierCosts.tsx';
import { companyName, day, label, money } from '../format.ts';

const AUTO_APPROVAL_TARGET = 80; // %, from the README's success metrics

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

// The Cash Flow Hub, the forwarder's view: is everything paid on time, what needs attention, and what it costs.
export function CashFlowHub() {
  const [params, setParams] = useSearchParams();
  const payerId = params.get('payer_id') ?? '';
  const { data, error } = useApi<DashboardData>(`/api/dashboard${payerId ? `?payer_id=${encodeURIComponent(payerId)}` : ''}`);
  // Links into the shipment list keep the forwarder selected here.
  const list = (filters: Record<string, string>) =>
    `/shipments?${new URLSearchParams({ ...(payerId ? { payer_id: payerId } : {}), ...filters })}`;

  if (error) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Couldn't load the Cash Flow Hub: {error.message}</p>;
  if (!data) return <p className="text-sm text-stone-500">Loading the Cash Flow Hub…</p>;
  const { totals: t, reviews: r } = data;
  const autoRate = pct(t.paid, t.shipments);
  const youPay = data.payer ? 'Your share' : 'Forwarders’ share';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cash Flow Hub</h1>
          <p className="text-sm text-stone-500">
            {data.payer ? companyName(data.payer.name) : 'All forwarders (program view)'} · {day(data.period.from)} – {day(data.period.to)} (all sample data)
          </p>
        </div>
        <div role="group" aria-label="Forwarder" className="flex flex-wrap gap-1 rounded-full bg-white p-1 ring-1 ring-stone-200">
          {[{ id: '', name: 'All forwarders' }, ...data.payers].map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === payerId}
              onClick={() => setParams(p.id ? { payer_id: p.id } : {}, { replace: true })}
              className={`rounded-full px-3 py-1 text-sm font-medium ${p.id === payerId ? 'bg-ink text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
              {companyName(p.name).replace(/ (Freight )?(Forwarding|Partners)$/, '')}
            </button>
          ))}
        </div>
      </div>

      {r.awaiting_review > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <span>
            <strong>{r.awaiting_review} held payment{r.awaiting_review === 1 ? '' : 's'} awaiting review</strong>
            {r.oldest_days_waiting != null && <> · oldest held {r.oldest_days_waiting} day{r.oldest_days_waiting === 1 ? '' : 's'}</>}
          </span>
          <Link to={`/review-queue${payerId ? `?payer_id=${payerId}` : ''}`} className="rounded-full bg-ink px-4 py-1.5 font-semibold text-white hover:bg-stone-800">
            Open review queue
          </Link>
        </div>
      )}

      <section aria-label="Key figures" className="grid gap-4 lg:grid-cols-[1.2fr_3fr]">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <div className="text-sm font-medium text-stone-600">
            Paid automatically
            <InfoTip label="Paid automatically">Shipments that passed every hold rule and were paid with no one involved, out of all shipments. Target: at least {AUTO_APPROVAL_TARGET}%.</InfoTip>
          </div>
          <div className="mt-1 text-6xl font-bold tracking-tight">{autoRate}%</div>
          <p className="mt-1 text-sm text-stone-500">{t.paid} of {t.shipments} shipments · target ≥ {AUTO_APPROVAL_TARGET}%</p>
          <Meter value={autoRate} target={AUTO_APPROVAL_TARGET} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Tile label="Paid within 24 h of delivery" value={`${t.paid_within_24h} of ${t.paid}`} sub="the north star: no one involved"
            tip="Paid loads whose carrier had the money within 24 hours of confirmed delivery." />
          <Tile label="Average hours to carrier funds" value={t.avg_hours_to_funds != null ? `${t.avg_hours_to_funds} h` : '—'}
            sub={t.max_hours_to_funds != null ? `slowest ${t.max_hours_to_funds} h · target < 24 h` : undefined}
            tip="From confirmed delivery to money in the carrier’s bank account, averaged over paid loads." />
          <Tile label="Average float kept" value={t.avg_float_days != null ? `${t.avg_float_days} days` : '—'} sub="target 30–45 days"
            tip="Days between the carrier being paid and the forwarder’s card bill being due: cash the forwarder keeps meanwhile." />
          <Tile label="Held for review" value={`${t.held}`} sub={`${pct(t.held, t.shipments)}% · ${r.awaiting_review} awaiting, ${r.released} released, ${r.rejected} rejected`}
            tip="Payments the engine held because a rule failed. The forwarder reviews each one." to={list({ decision: 'held_for_review' })} />
          <Tile label="Awaiting delivery" value={`${t.awaiting_delivery}`} sub="loads on hold, nothing to pay yet"
            tip="Loads that haven’t been delivered, so there’s no payment decision yet." to={list({ decision: 'awaiting_delivery' })} />
          <Tile label={`Fees · ${youPay.toLowerCase()}`} value={money(t.fees_forwarder_cents)} sub={`of ${money(t.fees_total_cents)} total; carriers paid ${money(t.fees_carrier_cents)}`}
            tip="The 2.75% CashBridge fee on paid loads, split by each forwarder’s fee model." />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cash and fees">
          <p className="text-sm text-stone-600">Paid to carriers</p>
          <p className="text-3xl font-bold tabular-nums">{money(t.paid_cents)}</p>
          <p className="text-sm text-stone-500">
            across {t.paid + t.released_paid} loads: {t.paid} paid automatically within hours of delivery
            {t.released_paid > 0 && <>, {t.released_paid} released after review</>}
          </p>

          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Card bills: when the cash leaves
            <InfoTip label="Card bills">The card statement closes at month-end and is due 15 days later. Each bill is the carrier invoices charged that month plus the forwarder’s share of the fee.</InfoTip>
          </h3>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr><th className="py-1 font-medium">Due</th><th className="py-1 text-right font-medium">Loads</th><th className="py-1 text-right font-medium">Invoices</th><th className="py-1 text-right font-medium">Fee share</th><th className="py-1 text-right font-medium">Bill</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.card_bills.map((b) => (
                <tr key={b.due_date}>
                  <td className="py-1.5">{day(b.due_date)}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.loads}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(b.invoice_cents)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(b.forwarder_fee_cents)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{money(b.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-stone-600">
            How carriers compare with factoring or a credit line is in <strong>By carrier</strong> below.
          </p>
        </Card>

        <Card title="Holds by reason">
          <HoldsChart rows={data.holds_by_reason} href={(reason) => list({ reason })} />
          {data.holds_by_reason.reduce((a, h) => a + h.count, 0) > t.held && (
            <p className="mt-3 text-xs text-stone-500">
              Adds up to more than {t.held} because a refused load counts under both “no proof of delivery” and “delivery exception”.
            </p>
          )}
        </Card>
      </div>

      <Card title={`Oldest awaiting review · ${r.awaiting_review}`}>
        {data.queue.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing waiting. Every held payment has been reviewed.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="py-1.5 pr-4">Shipment</th><th className="py-1.5 pr-4">Carrier</th><th className="py-1.5 pr-4 text-right">Invoice</th><th className="py-1.5 pr-4">Why it’s held</th><th className="py-1.5 text-right">Waiting</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.queue.map((q) => (
                  <tr key={q.shipment_id}>
                    <td className="whitespace-nowrap py-2 pr-4 font-semibold">
                      <Link to={`/review-queue?${new URLSearchParams({ ...(payerId ? { payer_id: payerId } : {}), id: q.shipment_id })}`}
                        className="text-accent-ink hover:underline">{q.shipment_id}</Link>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 text-stone-600">{companyName(q.carrier_name)}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">{money(q.invoice_cents)}</td>
                    <td className="py-2 pr-4 text-stone-600">{q.reasons.map((x) => HOLD_REASONS[x]).join('; ')}</td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums">{q.days_waiting} day{q.days_waiting === 1 ? '' : 's'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-stone-500">
          Waiting time is counted to {day(data.period.to)}, the end of the sample data.{' '}
          <Link to="/audit-log" className="font-medium text-accent-ink hover:underline">Audit log of every review</Link>
        </p>
      </Card>

      <CarrierCosts carriers={data.carriers} listHref={list} />

      <p className="text-xs text-stone-500">
        Every figure is computed from the engine’s decisions and the forwarder’s reviews. Payments the forwarder released are
        included in the money figures; the speed figures (hours to funds, paid within 24 h) count automatic payments only.
      </p>
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

function Tile({ label: name, value, sub, tip, to }: { label: string; value: string; sub?: string; tip: ReactNode; to?: string }) {
  const body = (
    <>
      <div className="text-sm text-stone-600">{name}<InfoTip label={name}>{tip}</InfoTip></div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-500">{sub}</div>}
    </>
  );
  const cls = 'block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200';
  return to ? <Link to={to} className={`${cls} hover:ring-accent/50`}>{body}</Link> : <div className={cls}>{body}</div>;
}

// Track in a lighter step, fill in the accent, and a tick at the target.
function Meter({ value, target }: { value: number; target: number }) {
  return (
    <div className="relative mt-4 h-2 rounded-full bg-accent-soft" role="img" aria-label={`${value}% against a ${target}% target`}>
      <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
      <div className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: `${target}%` }} title={`Target ${target}%`} />
    </div>
  );
}

// One series, so no legend: horizontal bars from a shared baseline, value at the tip.
// Each row links to the shipment list filtered to that reason.
function HoldsChart({ rows, href }: { rows: DashboardData['holds_by_reason']; href: (reason: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-sm text-stone-500">No holds.</p>;
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.reason}>
          <Link to={href(r.reason)} title={`${HOLD_REASONS[r.reason]}: ${r.count} held. Click to see them.`}
            className="group grid grid-cols-[minmax(0,11rem)_1fr] items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-canvas sm:grid-cols-[minmax(0,15rem)_1fr]">
            <span className="text-sm text-stone-700 group-hover:text-ink">{HOLD_REASONS[r.reason]}</span>
            <span className="flex items-center gap-2">
              <span className="h-3.5 rounded-r bg-accent" style={{ width: `${(r.count / max) * 85}%` }} />
              <span className="text-sm font-semibold tabular-nums text-ink">{r.count}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
