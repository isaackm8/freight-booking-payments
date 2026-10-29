// The forwarder dashboard: figures are checked against the answer key, not hard-coded.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { loadDatabase } from './db.ts';
import { getDashboard } from './dashboard.ts';
import { listShipments } from './queries.ts';
import { ReviewStore } from './reviews.ts';
import { DATA_DIR } from './paths.ts';

let db: DatabaseSync;
before(() => {
  ({ db } = loadDatabase(DATA_DIR, ':memory:'));
});
after(() => db.close());

// Sums a column of the answer key over paid shipments, optionally for one forwarder.
function expected(column: string, payerId?: string): number {
  const { v } = db.prepare(
    `SELECT COALESCE(SUM(p.${column}), 0) AS v FROM payments_expected p JOIN shipments s USING (shipment_id)
      WHERE p.expected_decision LIKE 'auto_approved%' ${payerId ? 'AND s.payer_id = ?' : ''}`,
  ).get(...(payerId ? [payerId] : [])) as { v: number };
  return v;
}

test('all forwarders: counts and money match the answer key', () => {
  const d = getDashboard(db)!;
  assert.equal(d.payer, null);
  assert.deepEqual(
    [d.totals.shipments, d.totals.paid, d.totals.held, d.totals.awaiting_delivery],
    [500, 445, 50, 5],
  );
  assert.equal(d.totals.paid_cents, expected('amount_paid_cents'));
  assert.equal(d.totals.fees_total_cents, expected('total_fee_cents'));
  assert.equal(d.totals.fees_forwarder_cents, expected('fee_paid_by_payer_cents'));
  assert.equal(d.totals.fees_carrier_cents, expected('fee_paid_by_carrier_cents'));
  assert.equal(d.totals.factoring_avoided_cents, expected('carrier_factoring_avoided_cents'));
  assert.equal(d.totals.paid_within_24h, 445);
  assert.equal(d.totals.avg_float_days, 32);
});

test('one forwarder: only its shipments, and its fee model shows in the split', () => {
  for (const id of ['PAY-01', 'PAY-02', 'PAY-03']) {
    const d = getDashboard(db, id)!;
    assert.equal(d.payer?.payer_id, id);
    assert.equal(d.totals.shipments, listShipments(db, { payer_id: id }).total);
    assert.equal(d.totals.paid_cents, expected('amount_paid_cents', id));
    assert.equal(d.totals.fees_forwarder_cents, expected('fee_paid_by_payer_cents', id));
  }
  assert.equal(getDashboard(db, 'PAY-01')!.totals.fees_forwarder_cents, 0);   // carrier pays
  assert.equal(getDashboard(db, 'PAY-03')!.totals.fees_carrier_cents, 0);     // forwarder pays
  assert.equal(getDashboard(db, 'PAY-99'), null);
});

test('card bills add up to what was paid plus the forwarder’s fees', () => {
  const d = getDashboard(db)!;
  assert.deepEqual(d.card_bills.map((b) => b.due_date), ['2026-11-15', '2026-12-15']);
  assert.equal(d.card_bills.reduce((a, b) => a + b.loads, 0), 445);
  assert.equal(d.card_bills.reduce((a, b) => a + b.total_cents, 0), d.totals.paid_cents + d.totals.fees_forwarder_cents);
});

test('holds by reason count every reason; the list filter by reason agrees', () => {
  const d = getDashboard(db)!;
  const counts = Object.fromEntries(d.holds_by_reason.map((h) => [h.reason, h.count]));
  assert.deepEqual(counts, {
    amount_above_approved_range: 25, off_route: 5, delivered_to_unexpected_recipient: 5,
    bank_account_changed_recently: 5, missing_proof_of_delivery: 7, delivery_exception: 5,
  });
  for (const { reason, count } of d.holds_by_reason) {
    assert.equal(listShipments(db, { reason }).total, count, reason);
  }
});

test('carriers add up to the totals', () => {
  const d = getDashboard(db)!;
  assert.equal(d.carriers.reduce((a, c) => a + c.loads, 0), 500);
  assert.equal(d.carriers.reduce((a, c) => a + c.paid_cents, 0), d.totals.paid_cents);
  assert.equal(d.carriers.reduce((a, c) => a + c.factoring_avoided_cents, 0), d.totals.factoring_avoided_cents);
});

test('the review queue shows the oldest waiting first and updates when a payment is reviewed', () => {
  const before = getDashboard(db)!;
  assert.equal(before.reviews.awaiting_review, 50);
  assert.equal(before.queue.length, 5);
  assert.ok(before.queue.every((q, i) => i === 0 || before.queue[i - 1].days_waiting >= q.days_waiting));
  assert.equal(before.reviews.oldest_days_waiting, before.queue[0].days_waiting);

  new ReviewStore(db).decide(before.queue[0].shipment_id, 'released', null);
  const afterReview = getDashboard(db)!;
  assert.equal(afterReview.reviews.awaiting_review, 49);
  assert.equal(afterReview.reviews.released, 1);
  assert.notEqual(afterReview.queue[0].shipment_id, before.queue[0].shipment_id);
});

test('credit-line inputs: each paid load counts its invoice for the days that forwarder makes carriers wait', () => {
  const d = getDashboard(db)!;
  const { v } = db.prepare(
    `SELECT SUM(p.amount_paid_cents * f.current_terms_to_carriers_days) AS v
       FROM payments_expected p JOIN shipments s USING (shipment_id) JOIN payers f ON f.payer_id = s.payer_id
      WHERE p.expected_decision LIKE 'auto_approved%'`,
  ).get() as { v: number };
  assert.equal(d.carriers.reduce((a, c) => a + c.paid_cent_days, 0), v);
  for (const c of d.carriers) {
    assert.equal(c.credit_line_apr_pct != null, c.cash_preference === 'credit_line', c.carrier_id);
  }
});
