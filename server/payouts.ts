// Paying a held payment after the forwarder releases it, in the demo's own time.
// The sample data is a fixed window (it ends on Nov 16, 2026), so "now" in the demo is the last
// tracking update in it. A released payment is charged then, and the simulated card-to-account
// provider funds the carrier 4–20 hours later, like the automatic payouts in provider_payouts.csv.
import type { DatabaseSync } from 'node:sqlite';
import type { DecisionRecord } from '../shared/decisions.ts';
import { payReleased, type DecisionInput } from './engine.ts';

const HOUR = 3_600_000;

export function demoNow(db: DatabaseSync): string {
  return (db.prepare('SELECT MAX(ts) AS now FROM tracking_events').get() as { now: string }).now;
}

// A steady 4–20 hours per shipment (the same every time), standing in for the provider's report.
export function simulatedPayoutHours(shipmentId: string): number {
  let h = 0;
  for (const ch of shipmentId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 4 + (h % 161) / 10;
}

export function canRelease(decision: DecisionRecord | null): boolean {
  return decision?.decision === 'held_for_review' && decision.delivered_ts != null;
}

// The payment made for a released shipment.
export function releasedPayment(db: DatabaseSync, input: DecisionInput, decision: DecisionRecord): DecisionRecord {
  const chargeTs = demoNow(db);
  const fundsTs = new Date(Date.parse(chargeTs) + simulatedPayoutHours(input.shipment.shipment_id) * HOUR)
    .toISOString().replace(/\.\d{3}Z$/, 'Z');
  return payReleased(decision, input, chargeTs, fundsTs);
}
