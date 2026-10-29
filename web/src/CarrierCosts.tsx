import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Dashboard } from '../../shared/types.ts';
import { InfoTip } from './InfoTip.tsx';
import { companyName, label, money } from './format.ts';

type Carrier = Dashboard['carriers'][number];
type Method = 'all' | 'factoring' | 'credit_line' | 'waits';

const FACTORING = { min: 1, max: 10, step: 0.1 };   // % of the invoice
const CREDIT_APR = { min: 5, max: 30, step: 0.5 };  // % a year

interface WhatIf {
  scope: string;               // '' = every carrier, else one carrier_id
  factoringPct: number | null; // null = each load's own rate
  aprPct: number | null;       // null = each carrier's own APR
}
const OWN_RATES: WhatIf = { scope: '', factoringPct: null, aprPct: null };
const same = (a: WhatIf, b: WhatIf) => a.scope === b.scope && a.factoringPct === b.factoringPct && a.aprPct === b.aprPct;

// What each carrier pays today to get its cash early, against the CashBridge fee it pays instead.
// Rates default to each load's or carrier's own. The sliders and carrier picker set up a what-if,
// which takes effect when the user clicks Apply; the Show filter applies straight away.
export function CarrierCosts({ carriers, listHref }: { carriers: Carrier[]; listHref: (filters: Record<string, string>) => string }) {
  const [method, setMethod] = useState<Method>('all');
  const [draft, setDraft] = useState<WhatIf>(OWN_RATES);
  const [applied, setApplied] = useState<WhatIf>(OWN_RATES);
  const { scope, factoringPct, aprPct } = applied;
  const pending = !same(draft, applied);

  const applies = (c: Carrier) => scope === '' || scope === c.carrier_id;
  const costOf = (c: Carrier) => {
    if (c.cash_preference === 'factoring') {
      const own = factoringPct == null || !applies(c);
      return { cents: own ? c.factoring_avoided_cents : Math.round((c.paid_cents * factoringPct) / 100), whatIf: !own };
    }
    if (c.cash_preference === 'credit_line' && c.credit_line_apr_pct != null) {
      const own = aprPct == null || !applies(c);
      const apr = own ? c.credit_line_apr_pct : aprPct;
      return { cents: Math.round((c.paid_cent_days * apr) / 100 / 365), whatIf: !own, apr };
    }
    return null; // waits: no cash cost, just a long wait
  };
  const waitDays = (c: Carrier) => (c.paid_cents ? Math.round(c.paid_cent_days / c.paid_cents) : null);

  const rows = carriers.filter((c) => method === 'all' || c.cash_preference === method);
  const costed = rows.map((c) => ({ c, cost: costOf(c) }));
  const total = (f: (r: (typeof costed)[number]) => number) => costed.reduce((a, r) => a + f(r), 0);
  const totalCost = total((r) => r.cost?.cents ?? 0);
  const totalFeeCosted = total((r) => (r.cost ? r.c.fees_paid_by_carrier_cents : 0));
  const pickable = carriers.filter((c) => c.cash_preference !== 'waits');
  const nameOf = (id: string) => (id ? companyName(carriers.find((c) => c.carrier_id === id)?.name ?? id) : 'every carrier');
  const changed = method !== 'all' || !same(draft, OWN_RATES) || !same(applied, OWN_RATES);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">By carrier: cost of cash today vs CashBridge</h2>
        {changed && (
          <button type="button" onClick={() => { setMethod('all'); setDraft(OWN_RATES); setApplied(OWN_RATES); }}
            className="text-sm font-medium text-accent-ink hover:underline">Reset to each carrier’s own rates</button>
        )}
      </div>

      <div className="grid gap-4 rounded-xl bg-canvas p-4 lg:grid-cols-[auto_auto_1fr_1fr]">
        <Control label="Show">
          <div role="group" aria-label="Show carriers that" className="flex flex-wrap gap-1">
            {(['all', 'factoring', 'credit_line', 'waits'] as Method[]).map((m) => (
              <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${method === m ? 'bg-ink text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:text-ink'}`}>
                {m === 'all' ? 'All' : label(m)}
              </button>
            ))}
          </div>
        </Control>
        <Control label="Apply what-if rates to">
          <select value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })} aria-label="Apply what-if rates to"
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-accent focus:outline-none">
            <option value="">Every carrier</option>
            {pickable.map((c) => <option key={c.carrier_id} value={c.carrier_id}>{companyName(c.name)} · {label(c.cash_preference)}</option>)}
          </select>
        </Control>
        <RateSlider
          title="Factoring rate" unit="of invoice" range={FACTORING} value={draft.factoringPct} onChange={(v) => setDraft({ ...draft, factoringPct: v })}
          ownLabel="Each load’s own rate (6–8%)"
          tip="What a factoring company keeps for paying the invoice early. The white paper puts it at 6–8%; each sample load has its own rate in that range."
        />
        <RateSlider
          title="Credit line rate" unit="a year" range={CREDIT_APR} value={draft.aprPct} onChange={(v) => setDraft({ ...draft, aprPct: v })}
          ownLabel={`Each carrier’s own rate (${aprRange(carriers)})`}
          tip="Interest on a credit line the carrier draws on while it waits to be paid: invoice × rate × days waiting ÷ 365. The sample rates are made up; real small-business lines vary widely, so check current rates."
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!pending} onClick={() => setApplied(draft)}
          className="rounded-full bg-ink px-5 py-1.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-default disabled:bg-stone-300">
          Apply
        </button>
        <span className="text-sm text-stone-600" aria-live="polite">
          {pending
            ? <span className="font-medium text-amber-800">Not applied yet. Click Apply to see the impact.</span>
            : <>Showing: {describe(applied, nameOf)}.</>}
        </span>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        What-if rates apply to the carrier you pick (or every carrier); everyone else keeps their own rate. Factoring applies to carriers that factor, the credit line rate to carriers that use one.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-1.5 pr-4">Carrier</th>
              <th className="py-1.5 pr-4 text-right">Loads</th>
              <th className="py-1.5 pr-4 text-right">Paid</th>
              <th className="py-1.5 pr-4 text-right">Held</th>
              <th className="py-1.5 pr-4 text-right">Paid to carrier</th>
              <th className="py-1.5 pr-4 text-right">Hours to funds</th>
              <th className="py-1.5 pr-4">Gets cash today by</th>
              <th className="py-1.5 pr-4 text-right">
                Cost today<InfoTip label="Cost today">What the carrier would pay to get this money early without CashBridge: factoring, or interest on its credit line. A carrier that waits pays nothing, but waits the forwarder’s full terms.</InfoTip>
              </th>
              <th className="py-1.5 pr-4 text-right">CashBridge fee</th>
              <th className="py-1.5 text-right">
                Carrier saves<InfoTip label="Carrier saves">Cost today minus the carrier’s share of the CashBridge fee. Negative means CashBridge costs this carrier more than its current way of getting cash early.</InfoTip>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {costed.map(({ c, cost }) => {
              const saves = cost ? cost.cents - c.fees_paid_by_carrier_cents : null;
              return (
                <tr key={c.carrier_id} className={scope === c.carrier_id ? 'bg-accent-soft/60' : ''}>
                  <td className="whitespace-nowrap py-2 pr-4">
                    <Link to={listHref({ carrier_id: c.carrier_id })} className="font-medium text-accent-ink hover:underline">{companyName(c.name)}</Link>
                    <span className="text-stone-400"> · {c.segment}</span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{c.loads}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{c.paid}</td>
                  <td className={`py-2 pr-4 text-right tabular-nums ${c.held ? 'font-medium text-amber-800' : 'text-stone-400'}`}>{c.held}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(c.paid_cents)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{c.avg_hours_to_funds ?? '—'}</td>
                  <td className="whitespace-nowrap py-2 pr-4 text-stone-600">
                    {label(c.cash_preference)}
                    <span className="block text-xs text-stone-400">
                      {c.cash_preference === 'factoring' && c.paid_cents > 0 && `${((cost!.cents / c.paid_cents) * 100).toFixed(1)}% of invoice`}
                      {c.cash_preference === 'credit_line' && cost && `${cost.apr}% a year × ~${waitDays(c)} days`}
                      {c.cash_preference === 'waits' && waitDays(c) != null && `~${waitDays(c)} days unpaid`}
                      {cost?.whatIf && <span className="ml-1 rounded bg-accent px-1 text-[10px] font-semibold uppercase text-white">what-if</span>}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{cost ? money(cost.cents) : <span className="text-stone-400">$0, waits</span>}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(c.fees_paid_by_carrier_cents)}</td>
                  <td className="py-2 text-right tabular-nums"><Saves cents={saves} /></td>
                </tr>
              );
            })}
          </tbody>
          {costed.length > 1 && (
            <tfoot className="border-t-2 border-stone-200 font-semibold">
              <tr>
                <td className="py-2 pr-4">Total, {costed.length} carriers</td>
                <td className="py-2 pr-4 text-right tabular-nums">{total((r) => r.c.loads)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{total((r) => r.c.paid)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{total((r) => r.c.held)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(total((r) => r.c.paid_cents))}</td>
                <td className="py-2 pr-4" colSpan={2} />
                <td className="py-2 pr-4 text-right tabular-nums">{money(totalCost)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{money(totalFeeCosted)}</td>
                <td className="py-2 text-right tabular-nums"><Saves cents={totalCost - totalFeeCosted} /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-3 text-xs text-stone-500">
        Totals for “CashBridge fee” and “Carrier saves” cover carriers with a cost today (factoring or credit line). Carriers that wait pay a fee but
        save time, not money: they’re paid within hours instead of waiting the forwarder’s terms.
      </p>
    </section>
  );
}

function describe(w: WhatIf, nameOf: (id: string) => string) {
  if (w.factoringPct == null && w.aprPct == null) return 'each carrier’s own rates';
  const parts = [
    w.factoringPct != null && `factoring at ${w.factoringPct}% of invoice`,
    w.aprPct != null && `credit line at ${w.aprPct}% a year`,
  ].filter(Boolean);
  return `${parts.join(' and ')} for ${nameOf(w.scope)}`;
}

function aprRange(carriers: Carrier[]) {
  const aprs = carriers.map((c) => c.credit_line_apr_pct).filter((a): a is number => a != null);
  return aprs.length ? `${Math.min(...aprs)}–${Math.max(...aprs)}%` : 'none';
}

function Control({ label: name, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{name}</div>
      {children}
    </div>
  );
}

// A slider that is off (each carrier's own rate) until the box is unticked.
function RateSlider({ title, unit, range, value, onChange, ownLabel, tip }: {
  title: string; unit: string; range: { min: number; max: number; step: number };
  value: number | null; onChange: (v: number | null) => void; ownLabel: string; tip: ReactNode;
}) {
  const id = title.toLowerCase().replace(/\s+/g, '-');
  const own = value == null;
  const [last, setLast] = useState((range.min + range.max) / 2); // where the slider sits while "own rates" is ticked
  const shown = value ?? last;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {title}<InfoTip label={title}>{tip}</InfoTip>
        </label>
        <span className={`text-sm font-semibold tabular-nums ${own ? 'text-stone-400' : 'text-ink'}`}>{own ? 'own rates' : `${shown}% ${unit}`}</span>
      </div>
      <input id={id} type="range" min={range.min} max={range.max} step={range.step} value={shown}
        onChange={(e) => { setLast(Number(e.target.value)); onChange(Number(e.target.value)); }}
        className={`w-full accent-[var(--color-accent)] ${own ? 'opacity-50' : ''}`} />
      <div className="flex justify-between text-[11px] text-stone-400"><span>{range.min}%</span><span>{range.max}%</span></div>
      <label className="mt-1 flex items-center gap-2 text-sm text-stone-600">
        <input type="checkbox" aria-label={ownLabel} checked={own} onChange={(e) => onChange(e.target.checked ? null : shown)} className="accent-[var(--color-accent)]" />
        {ownLabel}
      </label>
    </div>
  );
}

function Saves({ cents }: { cents: number | null }) {
  if (cents == null) return <span className="text-stone-400">—</span>;
  if (cents >= 0) return <span className="font-medium text-emerald-700">{money(cents)}</span>;
  return <span className="font-medium text-red-700" title="CashBridge costs this carrier more than its current way of getting cash early">−{money(-cents)}</span>;
}
