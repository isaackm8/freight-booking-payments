// Phase 1 "done when" check: all 500 shipments, their milestones, delivery evidence and invoices
// load, and any shipment ID shows its full record.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { loadDatabase } from './db.ts';
import { createApp } from './app.ts';
import { getShipment, listShipments } from './queries.ts';
import { DATA_DIR } from './paths.ts';
import type { ShipmentDetail, ShipmentListResponse } from '../shared/types.ts';

let db: DatabaseSync;
let counts: Record<string, number>;
let server: Server;
let baseUrl: string;

const csv = (file: string): Record<string, string>[] =>
  parse(readFileSync(join(DATA_DIR, file), 'utf8'), { columns: true, skip_empty_lines: true });

before(async () => {
  ({ db, counts } = loadDatabase(DATA_DIR, ':memory:'));
  server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  db.close();
});

test('loads 500 shipments, 3,053 milestones, 634 pieces of delivery evidence and 500 invoices', () => {
  assert.equal(counts.shipments, 500);
  assert.equal(counts.tracking_events, 3053);
  assert.equal(counts.delivery_evidence, 634);
  assert.equal(counts.invoices, 500);
  assert.equal(counts.payers, 3);
  assert.equal(counts.shippers, 9);
  assert.equal(counts.carriers, 20);
  assert.equal(counts.payments_expected, 500);
});

test('every row in every CSV made it into SQLite', () => {
  for (const [table, file] of [
    ['payers', 'payers.csv'], ['shippers', 'shippers.csv'], ['carriers', 'carriers.csv'], ['rate_rules', 'rate_rules.csv'],
    ['fuel_index', 'fuel_index.csv'], ['shipments', 'shipments.csv'], ['tracking_events', 'tracking_events.csv'],
    ['delivery_evidence', 'delivery_evidence.csv'],
    ['invoices', 'invoices.csv'], ['payments_expected', 'payments_expected.csv'],
  ]) {
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    assert.equal(n, csv(file).length, table);
  }
});

test("every shipment's shipper is a customer of that shipment's forwarder", () => {
  const { bad } = db.prepare(
    'SELECT COUNT(*) AS bad FROM shipments s JOIN shippers sh ON sh.shipper_id = s.shipper_id WHERE sh.payer_id <> s.payer_id',
  ).get() as { bad: number };
  assert.equal(bad, 0);
  const { forwarders_as_carriers } = db.prepare(
    'SELECT COUNT(*) AS forwarders_as_carriers FROM payers p JOIN carriers c ON c.name = p.name',
  ).get() as { forwarders_as_carriers: number };
  assert.equal(forwarders_as_carriers, 0, 'a forwarder is never a carrier');
});

test('money is stored as exact integer cents', () => {
  const rows = csv('invoices.csv');
  const stored = new Map(
    (db.prepare('SELECT invoice_id, total_cents, base_cents FROM invoices').all() as { invoice_id: string; total_cents: number; base_cents: number }[])
      .map((r) => [r.invoice_id, r]),
  );
  for (const r of rows) {
    const s = stored.get(r.invoice_id)!;
    assert.ok(Number.isInteger(s.total_cents));
    assert.equal(s.total_cents, Math.round(Number(r.total_usd) * 100), r.invoice_id);
    assert.equal(s.base_cents, Math.round(Number(r.base_usd) * 100), r.invoice_id);
  }
});

test('timestamps are stored as UTC', () => {
  const { bad } = db.prepare(
    "SELECT COUNT(*) AS bad FROM tracking_events WHERE ts NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z'",
  ).get() as { bad: number };
  assert.equal(bad, 0);
});

test('every shipment ID returns its full record', () => {
  const eventsPer = Map.groupBy(csv('tracking_events.csv'), (e) => e.shipment_id);
  const invoicesPer = Map.groupBy(csv('invoices.csv'), (i) => i.shipment_id);
  for (const row of csv('shipments.csv')) {
    const d = getShipment(db, row.shipment_id);
    assert.ok(d, `${row.shipment_id} not found`);
    assert.equal(d.shipment.shipment_id, row.shipment_id);
    assert.equal(d.payer.payer_id, row.payer_id);
    assert.equal(d.carrier.carrier_id, row.carrier_id);
    assert.equal(d.events.length, eventsPer.get(row.shipment_id)?.length ?? 0, `${row.shipment_id} events`);
    assert.equal(d.invoices.length, invoicesPer.get(row.shipment_id)?.length ?? 0, `${row.shipment_id} invoices`);
    assert.ok(d.events.length > 0, `${row.shipment_id} has no events`);
    // A load on hold hasn't been delivered, so the carrier hasn't invoiced it yet.
    assert.equal(d.invoices.length > 0, row.scenario !== 'shipment_on_hold', `${row.shipment_id} invoices`);
    assert.ok(d.rate_rules.length > 0, `${row.shipment_id} has no rate rules`);
    // Events come back in time order for the timeline.
    assert.deepEqual(d.events.map((e) => e.ts), [...d.events.map((e) => e.ts)].sort());
  }
});

test('tracking events are milestones only; proof of delivery is evidence', () => {
  const milestones = ['BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'DELAYED', 'DELIVERED', 'EXCEPTION', 'ON_HOLD'];
  const types = (db.prepare('SELECT DISTINCT event_type AS t FROM tracking_events').all() as { t: string }[]).map((r) => r.t);
  assert.deepEqual(types.filter((t) => !milestones.includes(t)), []);
  const kinds = (db.prepare('SELECT DISTINCT kind AS k FROM delivery_evidence ORDER BY k').all() as { k: string }[]).map((r) => r.k);
  assert.deepEqual(kinds, ['photo', 'rfid_scan', 'signature']);

  // Every shipment starts with BOOKED; DELAYED, EXCEPTION and ON_HOLD say why.
  for (const id of (db.prepare('SELECT shipment_id AS id FROM shipments').all() as { id: string }[]).map((r) => r.id)) {
    assert.equal(getShipment(db, id)!.events[0].event_type, 'BOOKED', id);
  }
  const { unexplained } = db.prepare(
    "SELECT COUNT(*) AS unexplained FROM tracking_events WHERE event_type IN ('DELAYED', 'EXCEPTION', 'ON_HOLD') AND reason IS NULL",
  ).get() as { unexplained: number };
  assert.equal(unexplained, 0);

  // Proof is missing only where the scenario says so: missing POD, refused loads and loads on hold.
  const noProof = (db.prepare(
    `SELECT s.shipment_id AS id, s.scenario FROM shipments s
      WHERE NOT EXISTS (SELECT 1 FROM delivery_evidence v WHERE v.shipment_id = s.shipment_id)`,
  ).all() as { id: string; scenario: string }[]);
  const refused = (db.prepare("SELECT shipment_id AS id FROM tracking_events WHERE reason = 'refused'").all() as { id: string }[]).map((r) => r.id);
  assert.equal(noProof.length, 12);
  assert.ok(noProof.every((r) => ['error_missing_pod', 'shipment_on_hold'].includes(r.scenario) || refused.includes(r.id)));

  // The answer key matches the new scenarios.
  const expected = (scenario: string) => db.prepare(
    'SELECT p.expected_decision AS d, p.hold_reasons AS r FROM payments_expected p JOIN shipments s USING (shipment_id) WHERE s.scenario = ?',
  ).all(scenario) as { d: string; r: string }[];
  assert.ok(expected('delivery_exception').every((p) => p.d === 'held_for_review' && p.r.startsWith('delivery_exception')));
  assert.ok(expected('shipment_on_hold').every((p) => p.d === 'awaiting_delivery' && p.r === 'shipment_on_hold'));
});

test('distances are in miles, and only the off-route test loads go past the 2 mi threshold', () => {
  const far = (db.prepare(
    `SELECT DISTINCT s.scenario FROM tracking_events e JOIN shipments s USING (shipment_id)
      WHERE e.event_type = 'IN_TRANSIT' AND e.off_route_mi > 2`,
  ).all() as { scenario: string }[]).map((r) => r.scenario);
  assert.deepEqual(far, ['fraud_off_route']);
  const { n } = db.prepare(
    "SELECT COUNT(DISTINCT shipment_id) AS n FROM tracking_events WHERE event_type = 'IN_TRANSIT' AND off_route_mi > 2",
  ).get() as { n: number };
  assert.equal(n, 5);
});

test('shipment list returns all 500 and filters work', () => {
  assert.equal(listShipments(db).total, 500);
  assert.equal(listShipments(db, { scenario: 'clean' }).total, 340);
  assert.equal(listShipments(db, { scenario: 'error_duplicate_invoice' }).shipments.every((s) => s.invoice_count === 2), true);
  const byCarrier = listShipments(db, { carrier_id: 'CAR-01' });
  assert.ok(byCarrier.total > 0 && byCarrier.shipments.every((s) => s.carrier_id === 'CAR-01'));
  assert.equal(listShipments(db, { q: 'SHP-10001' }).shipments[0].shipment_id, 'SHP-10001');
  const byShipper = listShipments(db, { shipper_id: 'SHPR-01' });
  assert.ok(byShipper.total > 0 && byShipper.shipments.every((s) => s.shipper_id === 'SHPR-01' && s.shipper_name));
  assert.ok(listShipments(db, { q: 'Bluewater' }).shipments.every((s) => s.shipper_id === 'SHPR-04'));
});

test('API serves the list, any shipment detail, and 404 for unknown IDs', async () => {
  const list = (await (await fetch(`${baseUrl}/api/shipments`)).json()) as ShipmentListResponse;
  assert.equal(list.total, 500);

  for (const id of ['SHP-10001', 'SHP-10250', 'SHP-10500']) {
    const res = await fetch(`${baseUrl}/api/shipments/${id}`);
    assert.equal(res.status, 200);
    const d = (await res.json()) as ShipmentDetail;
    assert.equal(d.shipment.shipment_id, id);
    assert.ok(d.events.length > 0 && d.invoices.length > 0 && Array.isArray(d.evidence));
  }

  const missing = await fetch(`${baseUrl}/api/shipments/SHP-99999`);
  assert.equal(missing.status, 404);
});
