// The Payments page: figures are checked against the decisions and the answer key, not hard-coded.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDatabase } from './db.ts';
import { createApp } from './app.ts';
import { getPayments } from './payments.ts';
import { demoNow } from './payouts.ts';
import { ReviewStore } from './reviews.ts';
import { DATA_DIR } from './paths.ts';

let db: DatabaseSync;
let dir: string;
let reviews: ReviewStore;
before(() => {
  ({ db } = loadDatabase(DATA_DIR, ':memory:'));
  dir = mkdtempSync(join(tmpdir(), 'cashbridge-payments-'));
  reviews = new ReviewStore(db, join(dir, 'reviews.json'));
});
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

interface Expected {
  shipment_id: string; expected_decision: string; hold_reasons: string | null; amount_paid_cents: number;
  card_charge_ts: string | null; carrier_funds_ts: string | null; payer_statement_due_date: string | null;
  float_days: number | null; fee_paid_by_payer_cents: number; total_fee_cents: number;
}
const answerKey = (payerId: string) => db.prepare(
  `SELECT p.* FROM payments_expected p JOIN shipments s USING (shipment_id) WHERE s.payer_id = ? ORDER BY p.shipment_id`,
).all(payerId) as unknown as Expected[];

const PAYERS = ['PAY-01', 'PAY-02', 'PAY-03'];

test('value rows: one per paid load, days funded and fee share match the answer key', () => {
  for (const id of PAYERS) {
    const p = getPayments(db, id)!;
    const paid = answerKey(id).filter((e) => e.expected_decision.startsWith('auto_approved'));
    assert.equal(p.value.rows.length, paid.length);
    const byId = new Map(p.value.rows.map((r) => [r.shipment_id, r]));
    for (const e of paid) {
      const r = byId.get(e.shipment_id)!;
      assert.equal(r.amount_cents, e.amount_paid_cents, e.shipment_id);
      assert.equal(r.days_funded, e.float_days, e.shipment_id);
      assert.equal(r.statement_due_date, e.payer_statement_due_date, e.shipment_id);
      assert.equal(r.paid_to_carrier_ts, e.carrier_funds_ts, e.shipment_id);
      assert.equal(r.forwarder_fee_cents, e.fee_paid_by_payer_cents, e.shipment_id);
      // days funded = card bill due date - date paid to carrier
      assert.equal(r.days_funded, Math.round((Date.parse(r.statement_due_date) - Date.parse(r.paid_to_carrier_ts.slice(0, 10))) / 86_400_000));
      assert.ok(r.automatic);
    }
  }
  assert.ok(getPayments(db, 'PAY-01')!.value.rows.every((r) => r.forwarder_fee_cents === 0)); // carrier pays
});

test('working capital now: charged on or before the demo’s now and not yet due', () => {
  const today = demoNow(db).slice(0, 10);
  assert.equal(today, '2026-11-16');
  for (const id of PAYERS) {
    const p = getPayments(db, id)!;
    // October's bill was due Nov 15, so only November's charges (due Dec 15) are still on the card.
    const expected = answerKey(id).filter((e) => e.payer_statement_due_date === '2026-12-15')
      .reduce((a, e) => a + e.amount_paid_cents, 0);
    assert.ok(expected > 0);
    assert.equal(p.value.working_capital_now_cents, expected);
    assert.equal(p.value.series.at(-1)!.date, today);
    assert.equal(p.value.series.at(-1)!.outstanding_cents, expected);
    // The day before October's bill was due, everything charged so far was still on the card.
    const nov14 = p.value.series.find((s) => s.date === '2026-11-14')!;
    assert.equal(nov14.outstanding_cents, answerKey(id).filter((e) => e.card_charge_ts && e.card_charge_ts.slice(0, 10) <= '2026-11-14')
      .reduce((a, e) => a + e.amount_paid_cents, 0));
  }
});

test('card program: balance is this cycle’s charges plus fee share, within the credit limit', () => {
  for (const id of PAYERS) {
    const { card_program: c, payer } = getPayments(db, id)!;
    const cycle = answerKey(id).filter((e) => e.payer_statement_due_date === '2026-12-15');
    assert.equal(c.statement_closes, '2026-11-30');
    assert.equal(c.statement_due, '2026-12-15');
    assert.equal(c.statement_balance_cents, cycle.reduce((a, e) => a + e.amount_paid_cents + e.fee_paid_by_payer_cents, 0));
    assert.equal(c.available_credit_cents, payer.credit_limit_cents - c.statement_balance_cents);
    assert.deepEqual([c.last_statement?.closed, c.last_statement?.due, c.last_statement?.paid], ['2026-10-31', '2026-11-15', true]);
  }
});

test('virtual cards and history: statuses follow the decisions', () => {
  for (const id of PAYERS) {
    const p = getPayments(db, id)!;
    const key = answerKey(id);
    const count = (decision: string) => key.filter((e) => e.expected_decision === decision).length;
    const cards = (s: string) => p.cards.filter((c) => c.status === s).length;
    assert.equal(p.cards.length, key.length);
    assert.equal(cards('charged'), count('auto_approved') + count('auto_approved_duplicate_blocked'));
    assert.equal(cards('authorized'), count('held_for_review'));
    assert.equal(cards('issued'), count('awaiting_delivery'));
    assert.equal(cards('cancelled'), 0);
    for (const c of p.cards) {
      assert.match(c.card_last4, /^\d{4}$/);
      assert.ok(c.min_cents <= c.max_cents, c.shipment_id);
    }

    const rows = (s: string) => p.history.filter((h) => h.status === s);
    assert.equal(rows('paid').length, count('auto_approved') + count('auto_approved_duplicate_blocked'));
    assert.equal(rows('held').length, count('held_for_review'));
    assert.equal(rows('blocked').length, count('auto_approved_duplicate_blocked')); // one duplicate each in the sample
    for (const h of rows('held')) {
      assert.equal(h.reasons.join(';'), key.find((e) => e.shipment_id === h.shipment_id)!.hold_reasons, h.shipment_id);
      assert.equal(h.card_charge_ts, null);
    }
    assert.equal(rows('paid').reduce((a, h) => a + h.amount_cents, 0),
      key.reduce((a, e) => a + e.amount_paid_cents, 0));
  }
});

test('a released payment is charged now and counted; a rejected one cancels its card', () => {
  const held = getPayments(db, 'PAY-01')!.history.filter((h) => h.status === 'held');
  const release = held.find((h) => h.delivered_ts)!;
  const reject = held.find((h) => h !== release)!;
  const before = getPayments(db, 'PAY-01')!;
  reviews.decide(release.shipment_id, 'released', null);
  reviews.decide(reject.shipment_id, 'rejected', null);
  try {
    const p = getPayments(db, 'PAY-01')!;
    const now = demoNow(db);
    const h = p.history.find((x) => x.shipment_id === release.shipment_id)!;
    assert.equal(h.status, 'released');
    assert.equal(h.card_charge_ts, now);
    const v = p.value.rows.find((r) => r.shipment_id === release.shipment_id)!;
    assert.ok(!v.automatic && v.outstanding_now);
    assert.equal(v.statement_due_date, '2026-12-15');
    assert.equal(p.value.working_capital_now_cents, before.value.working_capital_now_cents + v.amount_cents);
    assert.equal(p.cards.find((c) => c.shipment_id === release.shipment_id)!.status, 'charged');
    assert.equal(p.cards.find((c) => c.shipment_id === reject.shipment_id)!.status, 'cancelled');
    assert.equal(p.history.find((x) => x.shipment_id === reject.shipment_id)!.status, 'rejected');
  } finally {
    reviews.undo(release.shipment_id);
    reviews.undo(reject.shipment_id);
  }
});

test('GET /api/payments needs a known forwarder', async () => {
  const server: Server = createApp(db, reviews).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  try {
    const ok = await fetch(`${base}/api/payments?payer_id=PAY-02`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).payer.payer_id, 'PAY-02');
    assert.equal((await fetch(`${base}/api/payments`)).status, 400);
    assert.equal((await fetch(`${base}/api/payments?payer_id=PAY-99`)).status, 404);
  } finally {
    server.close();
  }
});
