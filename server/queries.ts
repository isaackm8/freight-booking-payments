import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { AuditEntry, DecisionRecord, Review } from '../shared/decisions.ts';
import { canRelease, releasedPayment } from './payouts.ts';
import { shipmentHistory } from './history.ts';
import type {
  AuditLogResponse, Carrier, DeliveryEvidence, Invoice, Payer, ShipmentNeighbors, RateRule, Shipment, ShipmentDetail, ShipmentListResponse, ShipmentSummary, Shipper,
  TrackingEvent,
} from '../shared/types.ts';

export interface ShipmentFilters {
  payer_id?: string;
  shipper_id?: string;
  carrier_id?: string;
  segment?: string;
  scenario?: string;
  decision?: string;
  review?: string;
  reason?: string; // a hold reason, e.g. off_route
  q?: string;
}

export const FILTER_KEYS = ['payer_id', 'shipper_id', 'carrier_id', 'segment', 'scenario', 'decision', 'review', 'reason', 'q'] as const;

// A held payment is awaiting review until the forwarder releases or rejects it; other decisions have no review.
const REVIEW_STATUS_SQL = "CASE WHEN d.decision = 'held_for_review' THEN COALESCE(r.status, 'awaiting_review') END";

// One row per shipment, joined with names, the original (non-duplicate) invoice
// total, the invoice count and the latest tracking event.
const SUMMARY_SQL = `
  SELECT s.shipment_id, s.payer_id, p.name AS payer_name, s.shipper_id, sh.name AS shipper_name,
         s.carrier_id, c.name AS carrier_name,
         c.segment AS carrier_segment, s.origin_city, s.origin_state, s.dest_city, s.dest_state,
         s.pickup_ts, s.scheduled_delivery_ts, s.booked_rate_cents, s.approved_max_cents,
         (SELECT i.total_cents FROM invoices i
           WHERE i.shipment_id = s.shipment_id AND i.duplicate_of IS NULL
           ORDER BY i.invoice_id LIMIT 1) AS invoice_total_cents,
         (SELECT COUNT(*) FROM invoices i WHERE i.shipment_id = s.shipment_id) AS invoice_count,
         (SELECT e.event_type FROM tracking_events e
           WHERE e.shipment_id = s.shipment_id ORDER BY e.ts DESC LIMIT 1) AS latest_event_type,
         s.scenario, d.decision, d.hold_reasons, ${REVIEW_STATUS_SQL} AS review_status
    FROM shipments s
    JOIN payers p ON p.payer_id = s.payer_id
    JOIN shippers sh ON sh.shipper_id = s.shipper_id
    JOIN carriers c ON c.carrier_id = s.carrier_id
    LEFT JOIN decisions d ON d.shipment_id = s.shipment_id
    LEFT JOIN reviews r ON r.shipment_id = s.shipment_id`;

export function listShipments(db: DatabaseSync, f: ShipmentFilters = {}): ShipmentListResponse {
  const where: string[] = [];
  const params: SQLInputValue[] = [];
  if (f.payer_id) { where.push('s.payer_id = ?'); params.push(f.payer_id); }
  if (f.shipper_id) { where.push('s.shipper_id = ?'); params.push(f.shipper_id); }
  if (f.carrier_id) { where.push('s.carrier_id = ?'); params.push(f.carrier_id); }
  if (f.segment) { where.push('c.segment = ?'); params.push(f.segment); }
  if (f.scenario) { where.push('s.scenario = ?'); params.push(f.scenario); }
  if (f.decision) { where.push('d.decision = ?'); params.push(f.decision); }
  if (f.review) { where.push(`${REVIEW_STATUS_SQL} = ?`); params.push(f.review); }
  if (f.reason) { where.push("d.decision = 'held_for_review' AND (';' || d.hold_reasons || ';') LIKE ?"); params.push(`%;${f.reason};%`); }
  if (f.q) {
    where.push('(s.shipment_id LIKE ? OR s.origin_city LIKE ? OR s.dest_city LIKE ? OR c.name LIKE ? OR sh.name LIKE ?)');
    params.push(...Array(5).fill(`%${f.q}%`));
  }
  const sql = `${SUMMARY_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.shipment_id`;
  const shipments = db.prepare(sql).all(...params) as unknown as ShipmentSummary[];

  const col = (sql: string) => (db.prepare(sql).all() as { v: string }[]).map((r) => r.v);
  const { awaiting } = db.prepare(
    `SELECT COUNT(*) AS awaiting FROM decisions d LEFT JOIN reviews r USING (shipment_id) WHERE ${REVIEW_STATUS_SQL} = 'awaiting_review'`,
  ).get() as { awaiting: number };
  return {
    total: shipments.length,
    awaiting_review_total: awaiting,
    shipments,
    filters: {
      payers: db.prepare('SELECT payer_id AS id, name FROM payers ORDER BY payer_id').all() as unknown as ShipmentListResponse['filters']['payers'],
      shippers: db.prepare('SELECT shipper_id AS id, name FROM shippers ORDER BY name').all() as unknown as ShipmentListResponse['filters']['shippers'],
      carriers: db.prepare('SELECT carrier_id AS id, name FROM carriers ORDER BY carrier_id').all() as unknown as ShipmentListResponse['filters']['carriers'],
      segments: col("SELECT DISTINCT segment AS v FROM carriers ORDER BY CASE segment WHEN 'small' THEN 1 WHEN 'mid' THEN 2 ELSE 3 END"),
      scenarios: col('SELECT DISTINCT scenario AS v FROM shipments ORDER BY scenario'),
      decisions: col('SELECT DISTINCT decision AS v FROM decisions ORDER BY decision'),
    },
  };
}

// The full record for one shipment ID, or null if it doesn't exist.
// `decision` is null while runDecisions() is still building it (it calls this function for its inputs).
export function getShipment(db: DatabaseSync, shipmentId: string): ShipmentDetail | null {
  const shipment = db.prepare('SELECT * FROM shipments WHERE shipment_id = ?').get(shipmentId) as unknown as Shipment | undefined;
  if (!shipment) return null;
  const base = {
    shipment,
    payer: db.prepare('SELECT * FROM payers WHERE payer_id = ?').get(shipment.payer_id) as unknown as Payer,
    shipper: db.prepare('SELECT * FROM shippers WHERE shipper_id = ?').get(shipment.shipper_id) as unknown as Shipper,
    carrier: db.prepare('SELECT * FROM carriers WHERE carrier_id = ?').get(shipment.carrier_id) as unknown as Carrier,
    events: db.prepare(
      `SELECT event_id, event_type, ts, lat, lon, source, off_route_mi, recipient, reason
         FROM tracking_events WHERE shipment_id = ? ORDER BY ts, event_id`,
    ).all(shipmentId) as unknown as TrackingEvent[],
    evidence: db.prepare(
      `SELECT evidence_id, kind, ts, lat, lon, source, recipient
         FROM delivery_evidence WHERE shipment_id = ? ORDER BY ts, evidence_id`,
    ).all(shipmentId) as unknown as DeliveryEvidence[],
    invoices: db.prepare(
      `SELECT invoice_id, invoice_number, invoice_date, base_cents, fuel_cents, detention_cents,
              liftgate_cents, reweigh_cents, total_cents, currency, duplicate_of
         FROM invoices WHERE shipment_id = ? ORDER BY invoice_id`,
    ).all(shipmentId) as unknown as Invoice[],
    rate_rules: db.prepare(
      'SELECT charge_type, allowed, max_cents_per_shipment, cap_note FROM rate_rules WHERE payer_id = ? ORDER BY charge_type',
    ).all(shipment.payer_id) as unknown as RateRule[],
    decision: decisionOf(db, shipmentId),
    review: (db.prepare('SELECT status, note, reviewed_ts, reviewed_by FROM reviews WHERE shipment_id = ?')
      .get(shipmentId) as unknown as Review | undefined) ?? null,
  };
  const { decision, review } = base;
  const payment = decision?.settlement ? decision
    : review?.status === 'released' && canRelease(decision) ? releasedPayment(db, base, decision!)
    : null;
  const audit = db.prepare('SELECT * FROM audit_log WHERE shipment_id = ? ORDER BY id').all(shipmentId) as unknown as AuditEntry[];
  return {
    ...base,
    can_release: canRelease(decision),
    payment,
    history: shipmentHistory(decision, payment, audit, base.payer.name.replace(/\s*\(fictional[^)]*\)/, '')),
  };
}

// Every review action, newest first, for the audit log page.
export function auditLog(db: DatabaseSync): AuditLogResponse {
  const entries = db.prepare(
    `SELECT a.*, c.name AS carrier_name, p.name AS payer_name
       FROM audit_log a JOIN shipments s USING (shipment_id)
       JOIN carriers c ON c.carrier_id = s.carrier_id JOIN payers p ON p.payer_id = s.payer_id
      ORDER BY a.id DESC`,
  ).all() as unknown as AuditLogResponse['entries'];
  const counts = { released: 0, rejected: 0, review_undone: 0 };
  for (const e of entries) counts[e.action] += 1;
  return { entries, counts };
}

function decisionOf(db: DatabaseSync, shipmentId: string): DecisionRecord | null {
  const row = db.prepare('SELECT record FROM decisions WHERE shipment_id = ?').get(shipmentId) as { record: string } | undefined;
  return row ? JSON.parse(row.record) as DecisionRecord : null;
}

// Where a shipment sits in the (filtered) list, and the shipments before and after it, for
// previous / next on the detail page. The list is ordered by shipment ID, so a shipment that no
// longer matches the filters (e.g. just released from the review queue) still gets neighbors.
export function shipmentNeighbors(db: DatabaseSync, shipmentId: string, f: ShipmentFilters = {}): ShipmentNeighbors {
  const ids = listShipments(db, f).shipments.map((s) => s.shipment_id);
  const index = ids.indexOf(shipmentId);
  const prev = index >= 0 ? ids[index - 1] : ids.filter((id) => id < shipmentId).at(-1);
  const next = index >= 0 ? ids[index + 1] : ids.find((id) => id > shipmentId);
  return { position: index >= 0 ? index + 1 : null, total: ids.length, prev: prev ?? null, next: next ?? null };
}
