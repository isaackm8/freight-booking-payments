// Runs the decision engine for every shipment and stores the results in a `decisions` table,
// so the shipment list can show and filter them. Paid shipments are settled with the
// simulated provider's payout report (provider_payouts).
import type { DatabaseSync } from 'node:sqlite';
import type { DecisionRecord } from '../shared/decisions.ts';
import { decide, settle, DEFAULT_RULES, type DecisionInput, type Rules } from './engine.ts';
import { getShipment } from './queries.ts';

export function decisionFor(db: DatabaseSync, input: DecisionInput, rules: Rules = DEFAULT_RULES): DecisionRecord {
  const d = decide(input, rules);
  const payout = d.card_charge_ts
    ? db.prepare('SELECT carrier_funds_ts FROM provider_payouts WHERE shipment_id = ?').get(input.shipment.shipment_id) as { carrier_funds_ts: string } | undefined
    : undefined;
  return { ...d, settlement: payout ? settle(d, input, payout.carrier_funds_ts, rules) : null };
}

export function runDecisions(db: DatabaseSync, rules: Rules = DEFAULT_RULES): number {
  db.exec(`DROP TABLE IF EXISTS decisions;
    CREATE TABLE decisions (
      shipment_id TEXT PRIMARY KEY REFERENCES shipments(shipment_id),
      decision TEXT NOT NULL,
      hold_reasons TEXT NOT NULL,   -- ';'-separated, in rule order, as in the answer key
      record TEXT NOT NULL          -- the full DecisionRecord as JSON
    )`);
  const insert = db.prepare('INSERT INTO decisions (shipment_id, decision, hold_reasons, record) VALUES (?, ?, ?, ?)');
  const ids = (db.prepare('SELECT shipment_id AS id FROM shipments ORDER BY shipment_id').all() as { id: string }[]).map((r) => r.id);
  db.exec('BEGIN');
  for (const id of ids) {
    const r = decisionFor(db, getShipment(db, id)!, rules);
    insert.run(id, r.decision, r.reasons.join(';'), JSON.stringify(r));
  }
  db.exec('COMMIT');
  return ids.length;
}
