import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type {
  Carrier, Invoice, Payer, RateRule, Shipment, ShipmentDetail, ShipmentListResponse, ShipmentSummary, TrackingEvent,
} from '../shared/types.ts';

export interface ShipmentFilters {
  payer_id?: string;
  carrier_id?: string;
  segment?: string;
  scenario?: string;
  q?: string;
}

// One row per shipment, joined with names, the original (non-duplicate) invoice
// total, the invoice count and the latest tracking event.
const SUMMARY_SQL = `
  SELECT s.shipment_id, s.payer_id, p.name AS payer_name, s.carrier_id, c.name AS carrier_name,
         c.segment AS carrier_segment, s.origin_city, s.origin_state, s.dest_city, s.dest_state,
         s.pickup_ts, s.scheduled_delivery_ts, s.booked_rate_cents, s.approved_max_cents,
         (SELECT i.total_cents FROM invoices i
           WHERE i.shipment_id = s.shipment_id AND i.duplicate_of IS NULL
           ORDER BY i.invoice_id LIMIT 1) AS invoice_total_cents,
         (SELECT COUNT(*) FROM invoices i WHERE i.shipment_id = s.shipment_id) AS invoice_count,
         (SELECT e.event_type FROM tracking_events e
           WHERE e.shipment_id = s.shipment_id ORDER BY e.ts DESC LIMIT 1) AS latest_event_type,
         s.scenario
    FROM shipments s
    JOIN payers p ON p.payer_id = s.payer_id
    JOIN carriers c ON c.carrier_id = s.carrier_id`;

export function listShipments(db: DatabaseSync, f: ShipmentFilters = {}): ShipmentListResponse {
  const where: string[] = [];
  const params: SQLInputValue[] = [];
  if (f.payer_id) { where.push('s.payer_id = ?'); params.push(f.payer_id); }
  if (f.carrier_id) { where.push('s.carrier_id = ?'); params.push(f.carrier_id); }
  if (f.segment) { where.push('c.segment = ?'); params.push(f.segment); }
  if (f.scenario) { where.push('s.scenario = ?'); params.push(f.scenario); }
  if (f.q) {
    where.push('(s.shipment_id LIKE ? OR s.origin_city LIKE ? OR s.dest_city LIKE ? OR c.name LIKE ?)');
    params.push(...Array(4).fill(`%${f.q}%`));
  }
  const sql = `${SUMMARY_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.shipment_id`;
  const shipments = db.prepare(sql).all(...params) as unknown as ShipmentSummary[];

  const col = (sql: string) => (db.prepare(sql).all() as { v: string }[]).map((r) => r.v);
  return {
    total: shipments.length,
    shipments,
    filters: {
      payers: db.prepare('SELECT payer_id AS id, name FROM payers ORDER BY payer_id').all() as unknown as ShipmentListResponse['filters']['payers'],
      carriers: db.prepare('SELECT carrier_id AS id, name FROM carriers ORDER BY carrier_id').all() as unknown as ShipmentListResponse['filters']['carriers'],
      segments: col("SELECT DISTINCT segment AS v FROM carriers ORDER BY CASE segment WHEN 'small' THEN 1 WHEN 'mid' THEN 2 ELSE 3 END"),
      scenarios: col('SELECT DISTINCT scenario AS v FROM shipments ORDER BY scenario'),
    },
  };
}

// The full record for one shipment ID, or null if it doesn't exist.
export function getShipment(db: DatabaseSync, shipmentId: string): ShipmentDetail | null {
  const shipment = db.prepare('SELECT * FROM shipments WHERE shipment_id = ?').get(shipmentId) as unknown as Shipment | undefined;
  if (!shipment) return null;
  return {
    shipment,
    payer: db.prepare('SELECT * FROM payers WHERE payer_id = ?').get(shipment.payer_id) as unknown as Payer,
    carrier: db.prepare('SELECT * FROM carriers WHERE carrier_id = ?').get(shipment.carrier_id) as unknown as Carrier,
    events: db.prepare(
      `SELECT event_id, event_type, ts, lat, lon, source, off_route_km, recipient
         FROM tracking_events WHERE shipment_id = ? ORDER BY ts, event_id`,
    ).all(shipmentId) as unknown as TrackingEvent[],
    invoices: db.prepare(
      `SELECT invoice_id, invoice_number, invoice_date, base_cents, fuel_cents, detention_cents,
              liftgate_cents, reweigh_cents, total_cents, currency, duplicate_of
         FROM invoices WHERE shipment_id = ? ORDER BY invoice_id`,
    ).all(shipmentId) as unknown as Invoice[],
    rate_rules: db.prepare(
      'SELECT charge_type, allowed, max_cents_per_shipment, cap_note FROM rate_rules WHERE payer_id = ? ORDER BY charge_type',
    ).all(shipment.payer_id) as unknown as RateRule[],
  };
}
