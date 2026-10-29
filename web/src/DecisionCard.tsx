import type { ReactNode } from 'react';
import { DECISION_LABELS, HOLD_REASONS, type DecisionKind, type DecisionRecord, type HoldReason, type Review } from '../../shared/decisions.ts';
import type { Payer } from '../../shared/types.ts';
import { InfoTip } from './InfoTip.tsx';
import { ReviewPanel } from './ReviewPanel.tsx';
import { day, money, when } from './format.ts';

export const DECISION_STYLE: Record<DecisionKind, string> = {
  auto_approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  auto_approved_duplicate_blocked: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  held_for_review: 'bg-amber-50 text-amber-900 ring-amber-300',
  awaiting_delivery: 'bg-stone-100 text-stone-700 ring-stone-300',
};

const SUMMARY: Record<DecisionKind, string> = {
  auto_approved: 'Passed every hold rule, so the forwarder’s card was charged and the carrier paid automatically.',
  auto_approved_duplicate_blocked: 'Passed every hold rule. A second invoice for the same shipment was blocked, so the carrier was paid once.',
  held_for_review: 'Held automatically before any money moved. The forwarder has been notified to review it and release or reject the payment.',
  awaiting_delivery: 'Nothing to decide yet: the load hasn’t been delivered, so there is nothing to pay.',
};

const FEE_PAYER: Record<string, string> = {
  carrier_pays: 'carrier pays the fee',
  split: 'fee split 60% carrier / 40% forwarder',
  payer_pays: 'forwarder pays the fee',
};

export function DecisionCard({ shipmentId, decision: d, payer, review, onReviewChange }: {
  shipmentId: string;
  decision: DecisionRecord | null;
  payer: Payer;
  review: Review | null;
  onReviewChange: () => void;
}) {
  if (!d) return null;
  const s = d.settlement;
  const paid = d.decision === 'auto_approved' || d.decision === 'auto_approved_duplicate_blocked';
  return (
    <section className={`rounded-2xl p-5 shadow-sm ring-1 ${DECISION_STYLE[d.decision]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-80">Decision and payment</h2>
        <span className="text-xs opacity-70">Decided automatically by the CashBridge engine</span>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight">
        {DECISION_LABELS[d.decision]}{paid && <> · {money(d.amount_cents)}</>}
        {review && <> · {review.status === 'released' ? 'released' : 'rejected'} by forwarder</>}
      </p>
      <p className="mt-1 max-w-3xl text-sm">
        {review ? 'Held automatically before any money moved, then reviewed by the forwarder.' : SUMMARY[d.decision]}
      </p>

      {d.reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {d.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span aria-hidden className={paid ? 'text-emerald-700' : 'text-amber-700'}>●</span>
              <span>
                {HOLD_REASONS[r as HoldReason] ?? r}
                {r === 'duplicate_invoice_received' && d.blocked_invoice_ids.length > 0 && ` (${d.blocked_invoice_ids.join(', ')})`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {d.decision === 'held_for_review' && (
        <ReviewPanel shipmentId={shipmentId} forwarder={payer.name} notifiedTs={d.decided_ts} review={review} onChange={onReviewChange} />
      )}

      {paid && (
        <div className="mt-5 grid gap-4 lg:grid-cols-5">
          {s && (
            <div className="rounded-xl bg-white p-4 text-ink ring-1 ring-stone-200 lg:col-span-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Payment breakdown</h3>
              <ol className="space-y-4 text-sm">
                <Section n={1} title="Invoice amount" cents={d.amount_cents}>
                  <p className="text-stone-500">The carrier’s invoice {d.paid_invoice_id}, within the approved maximum.</p>
                </Section>

                <Section n={2} title="CashBridge fee, 2.75%" cents={s.total_fee_cents}>
                  <Line label={<>Card issuer · interchange 2.0%<InfoTip label="Card issuer">Earned by the forwarder’s card issuer (its bank) on every card payment. It also funds the float out of this.</InfoTip></>} cents={s.interchange_cents} />
                  <Line label={<>Card-to-account provider · 0.75%<InfoTip label="Card-to-account provider">Earned by the provider that accepts the card charge and pushes the money to the carrier’s bank account.</InfoTip></>} cents={s.provider_margin_cents} />
                </Section>

                <Section n={3} title={`Who pays the fee · ${FEE_PAYER[payer.fee_model] ?? payer.fee_model}`}>
                  <Line label="Carrier, deducted from its payout" cents={s.fee_paid_by_carrier_cents} />
                  <Line label="Forwarder, added to what it owes" cents={s.fee_paid_by_payer_cents} />
                </Section>

                <li>
                  <div className="mb-2 flex items-center gap-2 font-semibold"><Num n={4} />Bottom line</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <BottomLine
                      title="Carrier receives"
                      cents={d.amount_cents - s.fee_paid_by_carrier_cents}
                      math={`${money(d.amount_cents)} − ${money(s.fee_paid_by_carrier_cents)}`}
                      note={`In its bank account ${when(s.carrier_funds_ts)}, ${s.hours_delivery_to_funds} hours after delivery`}
                    />
                    <BottomLine
                      title="Forwarder owes"
                      cents={d.amount_cents + s.fee_paid_by_payer_cents}
                      math={`${money(d.amount_cents)} + ${money(s.fee_paid_by_payer_cents)}`}
                      note={`On its card bill due ${day(d.statement_due_date)}, ${s.float_days} days after the carrier was paid`}
                    />
                  </div>
                </li>
              </ol>
              <p className="mt-4 text-xs leading-relaxed text-stone-500">
                The shipper pays the forwarder separately, at the forwarder’s own price. Paid out of the fee, not added on top:
                the card network’s fee ({money(s.network_fee_cents)}, 0.13%) and the issuer’s cost of funding the {s.float_days}-day
                float ({money(s.issuer_funding_cost_cents)}, 5% a year).
              </p>
            </div>
          )}

          <div className="rounded-xl bg-white p-4 text-ink ring-1 ring-stone-200 lg:col-span-2">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Payment timeline</h3>
            <ol className="relative space-y-3 border-l border-stone-200 pl-5 text-sm">
              <Step title="Delivered" detail={when(d.delivered_ts)} />
              <Step title="Forwarder’s card charged" detail={`${when(d.card_charge_ts)} · 1 hour after delivery`} />
              <Step
                title="Carrier funded"
                detail={s ? `${when(s.carrier_funds_ts)} · ${s.hours_delivery_to_funds} hours after delivery` : 'Waiting for the provider to confirm'}
                accent
              />
              <Step
                title="Forwarder’s card bill due"
                detail={`${day(d.statement_due_date)}${s ? ` · ${s.float_days} days after the carrier was paid` : ''}`}
              />
            </ol>
          </div>
        </div>
      )}
      <p className="mt-4 text-xs opacity-70">Illustrative pricing. Carrier funding times come from the simulated payment provider.</p>
    </section>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">{n}</span>
  );
}

function Section({ n, title, cents, children }: { n: number; title: string; cents?: number; children: ReactNode }) {
  return (
    <li>
      <div className="flex items-center justify-between gap-3 font-semibold">
        <span className="flex items-center gap-2"><Num n={n} />{title}</span>
        {cents != null && <span className="tabular-nums">{money(cents)}</span>}
      </div>
      <div className="mt-1 space-y-0.5 pl-7">{children}</div>
    </li>
  );
}

function Line({ label, cents }: { label: ReactNode; cents: number }) {
  return (
    <div className="flex justify-between gap-3 text-stone-600">
      <span>{label}</span>
      <span className="tabular-nums">{money(cents)}</span>
    </div>
  );
}

function BottomLine({ title, cents, math, note }: { title: string; cents: number; math: string; note: string }) {
  return (
    <div className="rounded-lg bg-canvas p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</div>
      <div className="text-2xl font-bold tabular-nums">{money(cents)}</div>
      <div className="text-xs tabular-nums text-stone-500">{math}</div>
      <div className="mt-1 text-xs text-stone-600">{note}</div>
    </div>
  );
}

function Step({ title, detail, accent = false }: { title: string; detail: string; accent?: boolean }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full ${accent ? 'bg-accent' : 'bg-stone-400'}`} />
      <div className="font-medium">{title}</div>
      <div className="text-stone-600">{detail}</div>
    </li>
  );
}
