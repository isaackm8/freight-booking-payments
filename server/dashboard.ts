// The forwarder dashboard: every figure is computed from the engine's decisions and the
// forwarder's reviews, for one forwarder or all of them.
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { HOLD_REASONS, type DecisionRecord, type HoldReason, type ReviewStatus } from '../shared/decisions.ts';
import type { Dashboard, Payer } from '../shared/types.ts';

const RULE_ORDER = Object.keys(HOLD_REASONS) as HoldReason[];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

interface Row {
  shipment_id: string;
  carrier_id: string;
  carrier_name: string;
  carrier_segment: string;
  cash_preference: string;
  credit_line_apr_pct: number | null;
  terms_days: number;
  invoice_cents: number | null;
  record: string;
  review_status: string | null;
}

export function getDashboard(db: DatabaseSync, payerId?: string): Dashboard | null {
  const payer = payerId
    ? (db.prepare('SELECT * FROM payers WHERE payer_id = ?').get(payerId) as unknown as Payer | undefined)
    : undefined;
  if (payerId && !payer) return null;

  const where = payerId ? 'WHERE s.payer_id = ?' : '';
  const params: SQLInputValue[] = payerId ? [payerId] : [];
  const rows = (db.prepare(`
    SELECT s.shipment_id, s.carrier_id, c.name AS carrier_name, c.segment AS carrier_segment, c.cash_preference,
           c.credit_line_apr_pct, p.current_terms_to_carriers_days AS terms_days,
           (SELECT i.total_cents FROM invoices i WHERE i.shipment_id = s.shipment_id AND i.duplicate_of IS NULL
             ORDER BY i.invoice_id LIMIT 1) AS invoice_cents,
           d.record, r.status AS review_status
      FROM shipments s
      JOIN carriers c ON c.carrier_id = s.carrier_id
      JOIN payers p ON p.payer_id = s.payer_id
      JOIN decisions d ON d.shipment_id = s.shipment_id
      LEFT JOIN reviews r ON r.shipment_id = s.shipment_id
      ${where}
     ORDER BY s.shipment_id`).all(...params) as unknown as Row[])
    .map((r) => ({ ...r, d: JSON.parse(r.record) as DecisionRecord }));

  // The sample data is a fixed window in time, so "now" is the last tracking update in it.
  const { as_of } = db.prepare('SELECT MAX(ts) AS as_of FROM tracking_events').get() as { as_of: string };
  const { first } = db.prepare(
    `SELECT MIN(e.ts) AS first FROM tracking_events e JOIN shipments s USING (shipment_id) ${where}`,
  ).get(...params) as { first: string };

  const paid = rows.filter((r) => r.d.settlement);
  const held = rows.filter((r) => r.d.decision === 'held_for_review');
  const sum = (xs: typeof rows, f: (r: (typeof rows)[number]) => number) => xs.reduce((a, r) => a + f(r), 0);
  const hours = paid.map((r) => r.d.settlement!.hours_delivery_to_funds);
  const reviewOf = (r: Row): ReviewStatus => (r.review_status as ReviewStatus | null) ?? 'awaiting_review';
  const awaiting = held.filter((r) => reviewOf(r) === 'awaiting_review');
  const daysWaiting = (r: (typeof rows)[number]) => Math.max(0, (Date.parse(as_of) - Date.parse(r.d.decided_ts!)) / DAY);

  // Card bills: one per statement due date.
  const bills = new Map<string, { loads: number; invoice_cents: number; forwarder_fee_cents: number }>();
  for (const r of paid) {
    const b = bills.get(r.d.statement_due_date!) ?? { loads: 0, invoice_cents: 0, forwarder_fee_cents: 0 };
    b.loads += 1;
    b.invoice_cents += r.d.amount_cents;
    b.forwarder_fee_cents += r.d.settlement!.fee_paid_by_payer_cents;
    bills.set(r.d.statement_due_date!, b);
  }

  // Holds by reason, most common first, then rule order (a shipment with two reasons counts under both).
  const reasons = new Map<HoldReason, number>();
  for (const r of held) for (const reason of r.d.reasons) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);

  const carriers = new Map<string, Dashboard['carriers'][number] & { _hours: number[] }>();
  for (const r of rows) {
    const c = carriers.get(r.carrier_id) ?? {
      carrier_id: r.carrier_id, name: r.carrier_name, segment: r.carrier_segment, cash_preference: r.cash_preference,
      credit_line_apr_pct: r.credit_line_apr_pct,
      loads: 0, paid: 0, held: 0, paid_cents: 0, avg_hours_to_funds: null, fees_paid_by_carrier_cents: 0,
      factoring_avoided_cents: 0, paid_cent_days: 0, _hours: [],
    };
    c.loads += 1;
    if (r.d.settlement) {
      c.paid += 1;
      c.paid_cents += r.d.amount_cents;
      c.fees_paid_by_carrier_cents += r.d.settlement.fee_paid_by_carrier_cents;
      c.factoring_avoided_cents += r.d.settlement.carrier_factoring_avoided_cents;
      // For credit-line interest: invoice x days the carrier would otherwise wait for this forwarder.
      c.paid_cent_days += r.d.amount_cents * r.terms_days;
      c._hours.push(r.d.settlement.hours_delivery_to_funds);
    }
    if (r.d.decision === 'held_for_review') c.held += 1;
    carriers.set(r.carrier_id, c);
  }

  return {
    payer: payer ?? null,
    payers: db.prepare('SELECT payer_id AS id, name FROM payers ORDER BY payer_id').all() as unknown as Dashboard['payers'],
    period: { from: first, to: as_of },
    totals: {
      shipments: rows.length,
      paid: paid.length,
      held: held.length,
      awaiting_delivery: rows.filter((r) => r.d.decision === 'awaiting_delivery').length,
      paid_within_24h: hours.filter((h) => h <= 24).length,
      avg_hours_to_funds: round1(avg(hours)),
      max_hours_to_funds: hours.length ? Math.max(...hours) : null,
      avg_float_days: round1(avg(paid.map((r) => r.d.settlement!.float_days))),
      paid_cents: sum(paid, (r) => r.d.amount_cents),
      fees_total_cents: sum(paid, (r) => r.d.settlement!.total_fee_cents),
      fees_forwarder_cents: sum(paid, (r) => r.d.settlement!.fee_paid_by_payer_cents),
      fees_carrier_cents: sum(paid, (r) => r.d.settlement!.fee_paid_by_carrier_cents),
      factoring_avoided_cents: sum(paid, (r) => r.d.settlement!.carrier_factoring_avoided_cents),
    },
    reviews: {
      awaiting_review: awaiting.length,
      released: held.filter((r) => reviewOf(r) === 'released').length,
      rejected: held.filter((r) => reviewOf(r) === 'rejected').length,
      oldest_days_waiting: awaiting.length ? Math.floor(Math.max(...awaiting.map(daysWaiting))) : null,
    },
    card_bills: [...bills].sort(([a], [b]) => a.localeCompare(b)).map(([due_date, b]) => ({
      due_date, ...b, total_cents: b.invoice_cents + b.forwarder_fee_cents,
    })),
    holds_by_reason: [...reasons].map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || RULE_ORDER.indexOf(a.reason) - RULE_ORDER.indexOf(b.reason)),
    queue: awaiting
      .sort((a, b) => daysWaiting(b) - daysWaiting(a) || a.shipment_id.localeCompare(b.shipment_id))
      .slice(0, 5)
      .map((r) => ({
        shipment_id: r.shipment_id, carrier_name: r.carrier_name, invoice_cents: r.invoice_cents,
        reasons: r.d.reasons, held_since: r.d.decided_ts!, days_waiting: Math.floor(daysWaiting(r)),
      })),
    carriers: [...carriers.values()]
      .map(({ _hours, ...c }) => ({ ...c, avg_hours_to_funds: round1(avg(_hours)) }))
      .sort((a, b) => b.paid_cents - a.paid_cents),
  };
}
