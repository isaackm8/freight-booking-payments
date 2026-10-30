// Released payments get paid, refused loads can't be released, and every review action is logged.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDatabase } from './db.ts';
import { getDashboard } from './dashboard.ts';
import { demoNow, simulatedPayoutHours } from './payouts.ts';
import { auditLog, getShipment } from './queries.ts';
import { ReviewError, ReviewStore } from './reviews.ts';
import { DATA_DIR } from './paths.ts';
import type { AuditEntry } from '../shared/decisions.ts';

const ABOVE_MAX = 'SHP-10008'; // held: invoice above the approved maximum
const REFUSED = 'SHP-10164';   // held: refused by the consignee, never delivered

let db: DatabaseSync;
let store: ReviewStore;
let dir: string;

before(() => {
  ({ db } = loadDatabase(DATA_DIR, ':memory:'));
  dir = mkdtempSync(join(tmpdir(), 'cashbridge-payouts-'));
  store = new ReviewStore(db, join(dir, 'reviews.json'));
});
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a held payment has no payment until the forwarder releases it', () => {
  const d = getShipment(db, ABOVE_MAX)!;
  assert.equal(d.payment, null);
  assert.equal(d.can_release, true);
  assert.deepEqual(d.history.map((h) => h.kind), ['engine', 'engine']); // held, then the forwarder notified
});

test('releasing pays the invoice as it stands, charged at the demo’s now and funded 4–20 hours later', () => {
  const hubBefore = getDashboard(db)!;
  store.decide(ABOVE_MAX, 'released', 'Extra detention agreed by phone');
  const d = getShipment(db, ABOVE_MAX)!;
  const p = d.payment!;
  const invoice = d.invoices.find((i) => !i.duplicate_of)!;

  assert.equal(p.amount_cents, invoice.total_cents);
  assert.ok(invoice.total_cents > d.shipment.approved_max_cents, 'paid even though it was above the maximum');
  assert.equal(p.card_charge_ts, demoNow(db));
  const hours = (Date.parse(p.settlement!.carrier_funds_ts) - Date.parse(p.card_charge_ts!)) / 3_600_000;
  assert.ok(Math.abs(hours - simulatedPayoutHours(ABOVE_MAX)) < 0.001 && hours >= 4 && hours <= 20);
  assert.equal(p.statement_due_date, '2026-12-15'); // charged in November
  assert.equal(p.settlement!.total_fee_cents, p.settlement!.fee_paid_by_carrier_cents + p.settlement!.fee_paid_by_payer_cents);

  assert.deepEqual(d.history.map((h) => h.kind), ['engine', 'engine', 'review', 'payment', 'payment']);
  assert.match(d.history[2].text, /Released.*Extra detention agreed by phone/);

  // The Cash Flow Hub counts it in the money, but not in the automatic speed figures.
  const hub = getDashboard(db)!;
  assert.equal(hub.totals.released_paid, hubBefore.totals.released_paid + 1);
  assert.equal(hub.totals.paid, hubBefore.totals.paid);
  assert.equal(hub.totals.paid_cents, hubBefore.totals.paid_cents + p.amount_cents);
  assert.equal(hub.totals.avg_hours_to_funds, hubBefore.totals.avg_hours_to_funds);
  assert.equal(hub.card_bills.reduce((a, b) => a + b.total_cents, 0), hub.totals.paid_cents + hub.totals.fees_forwarder_cents);
});

test('a refused load can’t be released, only rejected', () => {
  assert.equal(getShipment(db, REFUSED)!.can_release, false);
  assert.throws(() => store.decide(REFUSED, 'released', null), (e: unknown) => e instanceof ReviewError && e.status === 409);
  store.decide(REFUSED, 'rejected', 'Consignee refused the load');
  assert.equal(getShipment(db, REFUSED)!.payment, null);
});

test('undo is logged, not erased; the payment goes away until released again', () => {
  store.undo(ABOVE_MAX);
  assert.equal(getShipment(db, ABOVE_MAX)!.payment, null);
  const log = auditLog(db);
  assert.deepEqual(log.entries.map((e) => [e.shipment_id, e.action]), [
    [ABOVE_MAX, 'review_undone'], [REFUSED, 'rejected'], [ABOVE_MAX, 'released'],
  ]);
  assert.deepEqual(log.counts, { released: 1, rejected: 1, review_undone: 1, info_requested: 0 });
  assert.equal(log.entries[1].note, 'Consignee refused the load');
  assert.ok(log.entries.every((e) => e.carrier_name && e.payer_name));
});

test('the audit log is saved to a file and loaded back after a restart', () => {
  const saved = JSON.parse(readFileSync(join(dir, 'audit.json'), 'utf8')) as AuditEntry[];
  assert.equal(saved.length, 3);
  const { db: fresh } = loadDatabase(DATA_DIR, ':memory:');
  new ReviewStore(fresh, join(dir, 'reviews.json'));
  assert.equal(auditLog(fresh).entries.length, 3);
  assert.equal(getShipment(fresh, REFUSED)!.review?.status, 'rejected');
  fresh.close();
});
