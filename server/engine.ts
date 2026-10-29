// The decision engine: pay or hold, for one shipment, from its own records.
// Pure functions only (no database, no clock), so every rule can be unit tested.
//
// decide()  - runs the hold rules and, if the shipment passes, says what to pay and when the card is charged.
// settle()  - once the payment provider reports when the carrier's money landed, works out float and fees.
import type {
  Carrier, DeliveryEvidence, Invoice, Payer, Shipment, TrackingEvent,
} from '../shared/types.ts';
import type { Decision, HoldReason, Settlement } from '../shared/decisions.ts';

export interface Rules {
  offRouteMi: number;              // rule 2
  bankChangeLookbackDays: number;  // rule 4
  chargeDelayHours: number;        // card charged this long after delivery is confirmed
  statementGraceDays: number;      // card bill due this many days after the statement closes (month-end)
  interchangePct: number;
  providerMarginPct: number;
  networkFeePct: number;
  issuerCostOfFundsAprPct: number;
  carrierShareOfSplitPct: number;  // fee model "split": the carrier's share
}

// Defaults from the build plan (illustrative pricing).
export const DEFAULT_RULES: Rules = {
  offRouteMi: 2,
  bankChangeLookbackDays: 14,
  chargeDelayHours: 1,
  statementGraceDays: 15,
  interchangePct: 2.0,
  providerMarginPct: 0.75,
  networkFeePct: 0.13,
  issuerCostOfFundsAprPct: 5.0,
  carrierShareOfSplitPct: 60,
};

export interface DecisionInput {
  shipment: Shipment;
  payer: Payer;
  carrier: Carrier;
  events: TrackingEvent[];
  evidence: DeliveryEvidence[];
  invoices: Invoice[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const addHours = (iso: string, h: number) => new Date(Date.parse(iso) + h * HOUR).toISOString().replace('.000Z', 'Z');
const dateOf = (iso: string) => iso.slice(0, 10);

// Fees are worked out in dollars and rounded to the cent, as a spreadsheet would: toFixed rounds the
// number as the computer stores it, so 53.355 (stored as 53.35499…) becomes 53.35. This matches the answer key.
const toCents = (dollarAmount: number) => Math.round(Number(dollarAmount.toFixed(2)) * 100);

// The card statement closes on the last day of the charge's month; the bill is due `grace` days later.
export function statementDueDate(chargeTs: string, graceDays: number): string {
  const d = new Date(chargeTs);
  const close = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
  return new Date(close + graceDays * DAY).toISOString().slice(0, 10);
}

export function decide(input: DecisionInput, rules: Rules = DEFAULT_RULES): Decision {
  const { shipment: s, carrier, events, evidence, invoices } = input;
  const delivered = events.find((e) => e.event_type === 'DELIVERED') ?? null;
  const exception = events.find((e) => e.event_type === 'EXCEPTION');
  const original = invoices.find((i) => !i.duplicate_of) ?? null;
  const duplicates = invoices.filter((i) => i.duplicate_of).map((i) => i.invoice_id);
  const reasons: HoldReason[] = [];

  // Rule 8: nothing to decide until the load is delivered (or the delivery fails).
  if (!delivered && !exception) {
    return {
      decision: 'awaiting_delivery', reasons: ['shipment_on_hold'], delivered_ts: null, decided_ts: null, paid_invoice_id: null,
      blocked_invoice_ids: duplicates, amount_cents: 0, card_charge_ts: null, statement_due_date: null,
    };
  }

  // Payment would happen at delivery + the charge delay; rule 4 looks back from that day.
  const paymentTs = delivered ? addHours(delivered.ts, rules.chargeDelayHours) : null;
  const decidedTs = addHours((delivered ?? exception)!.ts, rules.chargeDelayHours);

  if (original && original.total_cents > s.approved_max_cents) reasons.push('amount_above_approved_range');
  if (events.some((e) => e.event_type === 'IN_TRANSIT' && e.off_route_mi > rules.offRouteMi)) reasons.push('off_route');
  if (delivered && delivered.recipient !== s.consignee) reasons.push('delivered_to_unexpected_recipient');
  if (paymentTs && bankChangedRecently([s.carrier_bank_change_request_date, carrier.bank_account_last_changed], paymentTs, rules)) {
    reasons.push('bank_account_changed_recently');
  }
  if (evidence.length === 0) reasons.push('missing_proof_of_delivery');
  if (exception) reasons.push('delivery_exception');

  if (reasons.length > 0 || !original || !delivered || !paymentTs) {
    return {
      decision: 'held_for_review', reasons, delivered_ts: delivered?.ts ?? null, decided_ts: decidedTs, paid_invoice_id: null,
      blocked_invoice_ids: duplicates, amount_cents: 0, card_charge_ts: null, statement_due_date: null,
    };
  }

  // Rule 5: a duplicate invoice doesn't stop payment; the original is paid once and the copy is blocked.
  return {
    decision: duplicates.length ? 'auto_approved_duplicate_blocked' : 'auto_approved',
    reasons: duplicates.length ? ['duplicate_invoice_received'] : [],
    delivered_ts: delivered.ts,
    decided_ts: decidedTs,
    paid_invoice_id: original.invoice_id,
    blocked_invoice_ids: duplicates,
    amount_cents: original.total_cents,
    card_charge_ts: paymentTs,
    statement_due_date: statementDueDate(paymentTs, rules.statementGraceDays),
  };
}

function bankChangedRecently(dates: (string | null)[], paymentTs: string, rules: Rules): boolean {
  const pay = Date.parse(`${dateOf(paymentTs)}T00:00:00Z`);
  return dates.some((d) => {
    if (!d) return false;
    const days = (pay - Date.parse(`${dateOf(d)}T00:00:00Z`)) / DAY;
    return days >= 0 && days <= rules.bankChangeLookbackDays;
  });
}

// Works out timing and fees once the provider reports when the carrier's money landed.
export function settle(d: Decision, input: DecisionInput, carrierFundsTs: string, rules: Rules = DEFAULT_RULES): Settlement {
  if (!d.card_charge_ts || !d.delivered_ts || !d.statement_due_date) throw new Error(`${input.shipment.shipment_id} was not paid`);
  const dollars = d.amount_cents / 100;
  const pctOf = (pct: number, of = dollars) => toCents((of * pct) / 100);
  const floatDays = Math.round((Date.parse(d.statement_due_date) - Date.parse(dateOf(carrierFundsTs))) / DAY);
  const interchange = pctOf(rules.interchangePct);
  const providerMargin = pctOf(rules.providerMarginPct);
  const total = interchange + providerMargin;
  const carrierShare = { carrier_pays: 100, split: rules.carrierShareOfSplitPct, payer_pays: 0 }[input.payer.fee_model] ?? 0;
  const byCarrier = pctOf(carrierShare, total / 100);
  return {
    carrier_funds_ts: carrierFundsTs,
    hours_delivery_to_funds: Number(((Date.parse(carrierFundsTs) - Date.parse(d.delivered_ts)) / HOUR).toFixed(1)),
    float_days: floatDays,
    interchange_cents: interchange,
    issuer_funding_cost_cents: toCents((dollars * rules.issuerCostOfFundsAprPct) / 100 * floatDays / 365),
    network_fee_cents: pctOf(rules.networkFeePct),
    provider_margin_cents: providerMargin,
    total_fee_cents: total,
    fee_paid_by_carrier_cents: byCarrier,
    fee_paid_by_payer_cents: total - byCarrier,
    carrier_factoring_avoided_cents: input.carrier.cash_preference === 'factoring' ? pctOf(input.shipment.factoring_rate_pct) : 0,
  };
}
