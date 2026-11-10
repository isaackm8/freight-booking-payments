// The Payments page, for one forwarder's finance and accounts payable team: its card program, a
// virtual card per shipment, every payment, and the figures behind "value gained per transaction".
// Everything is computed from the engine's decisions and the forwarder's reviews. The setup shown is
// display-only: nothing here changes a decision.
import type { DatabaseSync } from 'node:sqlite';
import { HOLD_REASONS, type DecisionRecord, type HoldReason } from '../shared/decisions.ts';
import type {
  Option, Payer, PaymentHistoryRow, PaymentStatus, PaymentValueRow, PaymentsResponse, VirtualCard, VirtualCardStatus,
} from '../shared/types.ts';
import { DEFAULT_RULES, statementDueDate } from './engine.ts';
import { demoNow } from './payouts.ts';
import { getShipment } from './queries.ts';

const DAY = 86_400_000;
const dateOf = (iso: string) => iso.slice(0, 10);
const addDays = (isoDate: string, days: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

// A single-use card covers one load. It stays open 60 days after the scheduled delivery: room for a
// late delivery, a review and the dispute window. Once charged (or cancelled) it can't be used again.
export const CARD_EXPIRY_DAYS = 60;
export const APPROVED_RANGE_TOLERANCE_PCT = 10;

// Simulated terms of service, accepted before the sample data starts.
export const TERMS = { version: '1.2', accepted_by: 'Forwarder admin (demo)', accepted_on: '2026-09-15' };
export const ADMINS = ['Forwarder admin (demo)', "Forwarder's accounts payable (demo)"];

interface Row {
  shipment_id: string;
  carrier_id: string;
  carrier_name: string;
  origin_city: string; origin_state: string; dest_city: string; dest_state: string;
  scheduled_delivery_ts: string;
  booked_rate_cents: number;
  fuel_surcharge_pct: number;
  approved_max_cents: number;
  virtual_card_id: string;
  booked_ts: string;
  invoice_cents: number | null;
  record: string;
  review_status: 'released' | 'rejected' | null;
}

export function getPayments(db: DatabaseSync, payerId: string): PaymentsResponse | null {
  const payer = db.prepare('SELECT * FROM payers WHERE payer_id = ?').get(payerId) as unknown as Payer | undefined;
  if (!payer) return null;
  const asOf = demoNow(db);
  const today = dateOf(asOf);

  const rows = (db.prepare(`
    SELECT s.shipment_id, s.carrier_id, c.name AS carrier_name, s.origin_city, s.origin_state, s.dest_city, s.dest_state,
           s.scheduled_delivery_ts, s.booked_rate_cents, s.fuel_surcharge_pct, s.approved_max_cents, s.virtual_card_id,
           (SELECT MIN(e.ts) FROM tracking_events e WHERE e.shipment_id = s.shipment_id AND e.event_type = 'BOOKED') AS booked_ts,
           (SELECT i.total_cents FROM invoices i WHERE i.shipment_id = s.shipment_id AND i.duplicate_of IS NULL
             ORDER BY i.invoice_id LIMIT 1) AS invoice_cents,
           d.record, r.status AS review_status
      FROM shipments s
      JOIN carriers c ON c.carrier_id = s.carrier_id
      JOIN decisions d ON d.shipment_id = s.shipment_id
      LEFT JOIN reviews r ON r.shipment_id = s.shipment_id
     WHERE s.payer_id = ?
     ORDER BY s.shipment_id`).all(payerId) as unknown as Row[])
    .map((r) => {
      const d = JSON.parse(r.record) as DecisionRecord;
      // The payment made, if any: automatic, or after the forwarder released it (charged at the demo's now).
      const p = d.settlement ? d : r.review_status === 'released' ? getShipment(db, r.shipment_id)!.payment : null;
      return { ...r, d, p, lane: `${r.origin_city}, ${r.origin_state} → ${r.dest_city}, ${r.dest_state}` };
    });

  // Value gained: one row per paid load.
  const value: PaymentValueRow[] = rows.filter((r) => r.p?.settlement).map((r) => {
    const p = r.p!;
    const s = p.settlement!;
    return {
      shipment_id: r.shipment_id,
      carrier_name: r.carrier_name,
      amount_cents: p.amount_cents,
      card_charge_ts: p.card_charge_ts!,
      paid_to_carrier_ts: s.carrier_funds_ts,
      statement_due_date: p.statement_due_date!,
      expected_customer_payment_date: addDays(dateOf(p.delivered_ts!), payer.customer_terms_days),
      days_funded: s.float_days,
      forwarder_fee_cents: s.fee_paid_by_payer_cents,
      automatic: r.d.settlement != null,
      outstanding_now: dateOf(p.card_charge_ts!) <= today && p.statement_due_date! > today,
    };
  });

  // Card-funded working capital outstanding each day: charged on or before that day, bill not yet due.
  const series: PaymentsResponse['value']['series'] = [];
  const firstCharge = value.map((v) => dateOf(v.card_charge_ts)).sort()[0];
  for (let d = firstCharge; d && d <= today; d = addDays(d, 1)) {
    const outstanding = value
      .filter((v) => dateOf(v.card_charge_ts) <= d && v.statement_due_date > d)
      .reduce((a, v) => a + v.amount_cents, 0);
    series.push({ date: d, outstanding_cents: outstanding });
  }

  // The card program, as of now. The statement closes at month-end; the bill is due 15 days later.
  const statementDue = statementDueDate(asOf, DEFAULT_RULES.statementGraceDays);
  const statementCloses = addDays(statementDue, -DEFAULT_RULES.statementGraceDays);
  const billOf = (due: string) => value.filter((v) => v.statement_due_date === due)
    .reduce((a, v) => a + v.amount_cents + v.forwarder_fee_cents, 0);
  const balance = billOf(statementDue);
  const lastClosed = addDays(`${today.slice(0, 7)}-01`, -1);
  const lastDue = addDays(lastClosed, DEFAULT_RULES.statementGraceDays);
  const lastTotal = billOf(lastDue);

  const cards: VirtualCard[] = rows.map((r) => {
    let status: VirtualCardStatus = 'issued';
    if (r.p?.settlement) status = 'charged';
    else if (r.review_status === 'rejected') status = 'cancelled';
    else if (r.d.decision === 'held_for_review') status = 'authorized';
    return {
      card_last4: r.virtual_card_id.slice(-4),
      shipment_id: r.shipment_id,
      carrier_name: r.carrier_name,
      min_cents: Math.round(r.booked_rate_cents * (1 + r.fuel_surcharge_pct / 100)),
      max_cents: r.approved_max_cents,
      status,
      issued_ts: r.booked_ts,
      expires_date: addDays(dateOf(r.scheduled_delivery_ts), CARD_EXPIRY_DAYS),
      charged_cents: r.p?.settlement ? r.p.amount_cents : null,
    };
  });

  const history: PaymentHistoryRow[] = [];
  for (const r of rows) {
    if (r.d.decision === 'awaiting_delivery') continue; // nothing to pay yet; its card shows as issued
    const s = r.p?.settlement;
    const status: PaymentStatus = r.d.settlement ? 'paid'
      : r.review_status === 'released' && s ? 'released'
      : r.review_status === 'rejected' ? 'rejected'
      : 'held';
    const base = {
      shipment_id: r.shipment_id, carrier_id: r.carrier_id, carrier_name: r.carrier_name, lane: r.lane,
      delivered_ts: r.d.delivered_ts, decided_ts: r.d.decided_ts,
    };
    history.push({
      ...base, key: r.shipment_id,
      card_charge_ts: r.p?.card_charge_ts ?? null,
      funds_received_ts: s?.carrier_funds_ts ?? null,
      amount_cents: s ? r.p!.amount_cents : r.invoice_cents ?? 0,
      fee_cents: s?.total_fee_cents ?? null,
      forwarder_fee_cents: s?.fee_paid_by_payer_cents ?? null,
      status,
      // A paid load that blocked a duplicate shows that on the blocked row instead.
      reasons: status === 'paid' ? [] : r.d.reasons,
    });
    // Each duplicate invoice was blocked: never charged.
    for (const id of r.d.blocked_invoice_ids) {
      const inv = db.prepare('SELECT total_cents FROM invoices WHERE invoice_id = ?').get(id) as { total_cents: number };
      history.push({
        ...base, key: `${r.shipment_id}:${id}`, card_charge_ts: null, funds_received_ts: null,
        amount_cents: inv.total_cents, fee_cents: null, forwarder_fee_cents: null,
        status: 'blocked', reasons: ['duplicate_invoice_received'],
      });
    }
  }

  const totalFeePct = DEFAULT_RULES.interchangePct + DEFAULT_RULES.providerMarginPct;
  const carrierPct = { carrier_pays: 100, split: DEFAULT_RULES.carrierShareOfSplitPct, payer_pays: 0 }[payer.fee_model] ?? 0;

  return {
    payer,
    payers: db.prepare('SELECT payer_id AS id, name FROM payers ORDER BY payer_id').all() as unknown as Option[],
    as_of: asOf,
    setup: {
      admins: ADMINS,
      payout_method: 'Card-to-account push to the carrier’s verified bank account',
      approved_range_tolerance_pct: APPROVED_RANGE_TOLERANCE_PCT,
      hold_rules: Object.keys(HOLD_REASONS) as HoldReason[],
      charge_delay_hours: DEFAULT_RULES.chargeDelayHours,
      fee_split: { carrier_pct: carrierPct, forwarder_pct: 100 - carrierPct, total_fee_pct: totalFeePct },
      card_expiry_days: CARD_EXPIRY_DAYS,
    },
    terms: TERMS,
    card_program: {
      issuer: payer.issuer,
      credit_limit_cents: payer.credit_limit_cents,
      statement_balance_cents: balance,
      available_credit_cents: payer.credit_limit_cents - balance,
      statement_closes: statementCloses,
      statement_due: statementDue,
      // The demo assumes the forwarder paid its last bill in full on the due date.
      last_statement: lastTotal ? { closed: lastClosed, due: lastDue, total_cents: lastTotal, paid: lastDue <= today } : null,
    },
    value: {
      rows: value,
      working_capital_now_cents: value.filter((v) => v.outstanding_now).reduce((a, v) => a + v.amount_cents, 0),
      series,
    },
    cards,
    history,
    carriers: [...new Map(rows.map((r) => [r.carrier_id, r.carrier_name])).entries()]
      .map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    lanes: [...new Set(rows.map((r) => r.lane))].sort(),
  };
}
