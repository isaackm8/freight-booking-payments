// Phase 2 "done when" check: decisions match payments_expected.csv for 500 of 500 shipments,
// with unit tests per rule.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { loadDatabase } from './db.ts';
import { createApp } from './app.ts';
import { decide, settle, statementDueDate, type DecisionInput } from './engine.ts';
import { decisionFor } from './decisions.ts';
import { getShipment, listShipments } from './queries.ts';
import { DATA_DIR } from './paths.ts';
import type { Carrier, Payer, Shipment, ShipmentDetail, TrackingEvent } from '../shared/types.ts';

// A clean, deliverable shipment: invoice under the approved max, on route, delivered to the
// consignee with a signature, carrier's bank details unchanged for months.
function cleanShipment(): DecisionInput {
  const event = (event_type: string, ts: string, extra: Partial<TrackingEvent> = {}): TrackingEvent => ({
    event_id: `E-${event_type}`, event_type, ts, lat: 0, lon: 0, source: 'carrier_api', off_route_mi: 0,
    recipient: null, reason: null, ...extra,
  });
  return {
    shipment: {
      shipment_id: 'SHP-TEST', payer_id: 'PAY-T', shipper_id: 'SHPR-T', carrier_id: 'CAR-T', consignee: 'Dallas DC 2',
      approved_max_cents: 150_000, factoring_rate_pct: 7, carrier_bank_change_request_date: null,
    } as Shipment,
    payer: { payer_id: 'PAY-T', fee_model: 'split' } as Payer,
    carrier: { carrier_id: 'CAR-T', cash_preference: 'factoring', bank_account_last_changed: '2026-01-10' } as Carrier,
    events: [
      event('BOOKED', '2026-10-10T08:00:00Z'),
      event('PICKED_UP', '2026-10-12T08:00:00Z'),
      event('IN_TRANSIT', '2026-10-12T14:00:00Z', { off_route_mi: 0.6 }),
      event('DELIVERED', '2026-10-13T04:15:23Z', { recipient: 'Dallas DC 2' }),
    ],
    evidence: [{ evidence_id: 'V-1', kind: 'signature', ts: '2026-10-13T04:35:23Z', lat: 0, lon: 0, source: 'carrier_api', recipient: 'Dallas DC 2' }],
    invoices: [{
      invoice_id: 'INV-T', invoice_number: '1', invoice_date: '2026-10-13', base_cents: 120_000, fuel_cents: 7_852,
      detention_cents: 0, liftgate_cents: 0, reweigh_cents: 0, total_cents: 127_852, currency: 'USD', duplicate_of: null,
    }],
  };
}

describe('hold rules', () => {
  test('a clean shipment is paid automatically, card charged 1 hour after delivery', () => {
    const d = decide(cleanShipment());
    assert.equal(d.decision, 'auto_approved');
    assert.deepEqual(d.reasons, []);
    assert.equal(d.amount_cents, 127_852);
    assert.equal(d.card_charge_ts, '2026-10-13T05:15:23Z');
    assert.equal(d.statement_due_date, '2026-11-15');
  });

  test('rule 1: invoice above the approved maximum is held; at the maximum is paid', () => {
    const over = cleanShipment();
    over.invoices[0].total_cents = 150_001;
    assert.deepEqual(decide(over).reasons, ['amount_above_approved_range']);
    const at = cleanShipment();
    at.invoices[0].total_cents = 150_000;
    assert.equal(decide(at).decision, 'auto_approved');
  });

  test('rule 2: an in-transit update more than 2 mi off route is held; exactly 2 mi is not', () => {
    const off = cleanShipment();
    off.events[2].off_route_mi = 2.1;
    assert.deepEqual(decide(off).reasons, ['off_route']);
    const edge = cleanShipment();
    edge.events[2].off_route_mi = 2;
    assert.equal(decide(edge).decision, 'auto_approved');
  });

  test('rule 3: delivered to someone other than the consignee is held', () => {
    const s = cleanShipment();
    s.events[3].recipient = 'Dallas DC 7';
    assert.deepEqual(decide(s).reasons, ['delivered_to_unexpected_recipient']);
  });

  test('rule 4: a bank change within 14 days before payment is held; 15 days is not', () => {
    const requested = cleanShipment();
    requested.shipment.carrier_bank_change_request_date = '2026-10-09';
    assert.deepEqual(decide(requested).reasons, ['bank_account_changed_recently']);
    const changed = cleanShipment();
    changed.carrier.bank_account_last_changed = '2026-09-29'; // payment day Oct 13: 14 days
    assert.deepEqual(decide(changed).reasons, ['bank_account_changed_recently']);
    const older = cleanShipment();
    older.carrier.bank_account_last_changed = '2026-09-28'; // 15 days
    assert.equal(decide(older).decision, 'auto_approved');
  });

  test('rule 5: a duplicate invoice is blocked and the original paid once', () => {
    const s = cleanShipment();
    s.invoices.push({ ...s.invoices[0], invoice_id: 'INV-T-DUP', duplicate_of: 'INV-T' });
    const d = decide(s);
    assert.equal(d.decision, 'auto_approved_duplicate_blocked');
    assert.deepEqual(d.reasons, ['duplicate_invoice_received']);
    assert.equal(d.paid_invoice_id, 'INV-T');
    assert.deepEqual(d.blocked_invoice_ids, ['INV-T-DUP']);
    assert.equal(d.amount_cents, 127_852);
  });

  test('rule 6: no proof of delivery is held; any one kind of proof is enough', () => {
    const none = cleanShipment();
    none.evidence = [];
    assert.deepEqual(decide(none).reasons, ['missing_proof_of_delivery']);
    for (const kind of ['rfid_scan', 'signature', 'photo']) {
      const one = cleanShipment();
      one.evidence[0].kind = kind;
      assert.equal(decide(one).decision, 'auto_approved', kind);
    }
  });

  test('rule 7: a delivery exception is held; a refused load is also missing proof', () => {
    const damaged = cleanShipment();
    damaged.events.push({ ...damaged.events[3], event_id: 'E-X', event_type: 'EXCEPTION', recipient: null, reason: 'damaged' });
    assert.deepEqual(decide(damaged).reasons, ['delivery_exception']);

    const refused = cleanShipment();
    refused.events[3] = { ...refused.events[3], event_type: 'EXCEPTION', recipient: null, reason: 'refused' };
    refused.evidence = [];
    const d = decide(refused);
    assert.equal(d.decision, 'held_for_review');
    assert.deepEqual(d.reasons, ['missing_proof_of_delivery', 'delivery_exception']);
  });

  test('rule 8: a load on hold, not delivered, is awaiting delivery with nothing to pay', () => {
    const s = cleanShipment();
    s.events = [...s.events.slice(0, 3), { ...s.events[2], event_id: 'E-H', event_type: 'ON_HOLD', reason: 'held at customer request' }];
    s.evidence = [];
    s.invoices = [];
    const d = decide(s);
    assert.equal(d.decision, 'awaiting_delivery');
    assert.deepEqual(d.reasons, ['shipment_on_hold']);
    assert.equal(d.amount_cents, 0);
    assert.equal(d.card_charge_ts, null);
  });

  test('a delay is flagged on the timeline but does not hold payment', () => {
    const s = cleanShipment();
    s.events.splice(3, 0, { ...s.events[2], event_id: 'E-D', event_type: 'DELAYED', reason: 'ETA +3.1 h' });
    assert.equal(decide(s).decision, 'auto_approved');
  });

  test('every reason that applies is listed, in rule order', () => {
    const s = cleanShipment();
    s.invoices[0].total_cents = 200_000;
    s.events[2].off_route_mi = 90;
    s.evidence = [];
    assert.deepEqual(decide(s).reasons, ['amount_above_approved_range', 'off_route', 'missing_proof_of_delivery']);
  });
});

describe('payment timing and fees', () => {
  test('the card bill is due 15 days after the month-end statement', () => {
    assert.equal(statementDueDate('2026-10-15T05:15:23Z', 15), '2026-11-15');
    assert.equal(statementDueDate('2026-10-31T23:30:00Z', 15), '2026-11-15');
    assert.equal(statementDueDate('2026-11-01T00:10:00Z', 15), '2026-12-15');
    assert.equal(statementDueDate('2026-12-20T10:00:00Z', 15), '2027-01-15');
  });

  test('fees, float and the split follow the fee model', () => {
    const input = cleanShipment();
    const d = decide(input);
    const s = settle(d, input, '2026-10-13T16:52:04Z');
    assert.equal(s.float_days, 33);                    // Nov 15 - Oct 13
    assert.equal(s.hours_delivery_to_funds, 12.6);
    assert.equal(s.interchange_cents, 2_557);          // 2.0%
    assert.equal(s.provider_margin_cents, 959);        // 0.75%
    assert.equal(s.network_fee_cents, 166);            // 0.13%
    assert.equal(s.total_fee_cents, 3_516);            // interchange + provider margin
    assert.equal(s.fee_paid_by_carrier_cents, 2_110);  // split: carrier 60%
    assert.equal(s.fee_paid_by_payer_cents, 1_406);
    assert.equal(s.issuer_funding_cost_cents, 578);    // 5% a year for 33 days
    assert.equal(s.carrier_factoring_avoided_cents, 8_950); // factoring carrier, 7%

    input.payer.fee_model = 'payer_pays';
    assert.equal(settle(d, input, '2026-10-13T16:52:04Z').fee_paid_by_carrier_cents, 0);
    input.payer.fee_model = 'carrier_pays';
    assert.equal(settle(d, input, '2026-10-13T16:52:04Z').fee_paid_by_payer_cents, 0);
    input.carrier.cash_preference = 'waits';
    assert.equal(settle(d, input, '2026-10-13T16:52:04Z').carrier_factoring_avoided_cents, 0);
  });

  test('a shipment that was not paid cannot be settled', () => {
    const s = cleanShipment();
    s.evidence = [];
    assert.throws(() => settle(decide(s), s, '2026-10-13T16:52:04Z'));
  });
});

describe('against the answer key and the API', () => {
  let db: DatabaseSync;
  let server: Server;
  let baseUrl: string;

  before(async () => {
    ({ db } = loadDatabase(DATA_DIR, ':memory:'));
    server = createApp(db).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
    db.close();
  });

  test('decisions match payments_expected.csv for 500 of 500 shipments', () => {
    const expected = db.prepare('SELECT * FROM payments_expected ORDER BY shipment_id').all() as Record<string, string | number | null>[];
    assert.equal(expected.length, 500);
    const mismatches: string[] = [];
    for (const e of expected) {
      const r = decisionFor(db, getShipment(db, e.shipment_id as string)!);
      const s = r.settlement;
      const got: Record<string, unknown> = {
        expected_decision: r.decision, hold_reasons: r.reasons.join(';') || null, amount_paid_cents: r.amount_cents,
        card_charge_ts: r.card_charge_ts, carrier_funds_ts: s?.carrier_funds_ts ?? null,
        payer_statement_due_date: r.statement_due_date, float_days: s?.float_days ?? null,
        interchange_cents: s?.interchange_cents ?? 0, issuer_funding_cost_cents: s?.issuer_funding_cost_cents ?? 0,
        network_fee_cents: s?.network_fee_cents ?? 0, provider_margin_cents: s?.provider_margin_cents ?? 0,
        total_fee_cents: s?.total_fee_cents ?? 0, fee_paid_by_carrier_cents: s?.fee_paid_by_carrier_cents ?? 0,
        fee_paid_by_payer_cents: s?.fee_paid_by_payer_cents ?? 0,
        carrier_factoring_avoided_cents: s?.carrier_factoring_avoided_cents ?? 0,
      };
      for (const [k, v] of Object.entries(got)) {
        if (v !== e[k]) mismatches.push(`${e.shipment_id} ${k}: got ${v}, expected ${e[k]}`);
      }
      // The answer key worked out hours from the provider's unrounded times, so allow 0.1 h (6 minutes).
      const hours = s?.hours_delivery_to_funds ?? null;
      if (hours !== e.hours_delivery_to_funds && Math.abs((hours ?? -9) - Number(e.hours_delivery_to_funds)) > 0.1 + 1e-9) {
        mismatches.push(`${e.shipment_id} hours_delivery_to_funds: got ${hours}, expected ${e.hours_delivery_to_funds}`);
      }
    }
    assert.deepEqual(mismatches, []);
  });

  test('445 paid automatically, 50 held, 5 awaiting delivery', () => {
    const counts = Object.fromEntries(
      (db.prepare('SELECT decision, COUNT(*) AS n FROM decisions GROUP BY decision').all() as { decision: string; n: number }[])
        .map((r) => [r.decision, r.n]),
    );
    assert.deepEqual(counts, { auto_approved: 440, auto_approved_duplicate_blocked: 5, held_for_review: 50, awaiting_delivery: 5 });
  });

  test('the list shows and filters decisions, and the detail page gets the full record', async () => {
    const held = listShipments(db, { decision: 'held_for_review' });
    assert.equal(held.total, 50);
    assert.ok(held.shipments.every((s) => s.decision === 'held_for_review' && s.hold_reasons));
    assert.deepEqual(held.filters.decisions, ['auto_approved', 'auto_approved_duplicate_blocked', 'awaiting_delivery', 'held_for_review']);

    const paid = (await (await fetch(`${baseUrl}/api/shipments/SHP-10001`)).json()) as ShipmentDetail;
    assert.equal(paid.decision?.decision, 'auto_approved');
    assert.equal(paid.decision?.settlement?.total_fee_cents, 3_516);

    const offRoute = (await (await fetch(`${baseUrl}/api/shipments/SHP-10058`)).json()) as ShipmentDetail;
    assert.deepEqual(offRoute.decision?.reasons, ['off_route']);
    assert.equal(offRoute.decision?.settlement, null);

    const filtered = (await (await fetch(`${baseUrl}/api/shipments?decision=awaiting_delivery`)).json()) as { total: number };
    assert.equal(filtered.total, 5);
  });
});
