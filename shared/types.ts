// Shapes returned by the API. Money is integer cents; timestamps are UTC ISO strings.
import type { DecisionKind, DecisionRecord, HoldReason, Review, ReviewStatus } from './decisions.ts';

export interface ShipmentSummary {
  shipment_id: string;
  payer_id: string;
  payer_name: string;
  shipper_id: string;
  shipper_name: string;
  carrier_id: string;
  carrier_name: string;
  carrier_segment: string;
  origin_city: string;
  origin_state: string;
  dest_city: string;
  dest_state: string;
  pickup_ts: string;
  scheduled_delivery_ts: string;
  booked_rate_cents: number;
  approved_max_cents: number;
  invoice_total_cents: number | null;
  invoice_count: number;
  latest_event_type: string | null;
  scenario: string;
  decision: DecisionKind | null;
  hold_reasons: string | null; // ';'-separated, in rule order
  review_status: ReviewStatus | null; // only for held payments
}

export interface ShipmentListResponse {
  total: number;
  awaiting_review_total: number; // across all shipments, ignoring filters
  shipments: ShipmentSummary[];
  filters: { payers: Option[]; shippers: Option[]; carriers: Option[]; segments: string[]; scenarios: string[]; decisions: string[] };
}

export interface Option {
  id: string;
  name: string;
}

export interface Payer {
  payer_id: string;
  name: string;
  payer_type: string;
  service_level: string;
  issuer: string;
  network: string;
  credit_limit_cents: number;
  customer_terms_days: number;
  current_terms_to_carriers_days: number;
  statement_close_day: string;
  grace_days: number;
  fee_model: string;
}

export interface Shipper {
  shipper_id: string;
  name: string;
  payer_id: string;
  industry: string;
}

export interface Carrier {
  carrier_id: string;
  name: string;
  usdot_number: string;
  mc_number: string;
  fleet_size: number;
  segment: string;
  accepts_cards: number;
  cash_preference: string;
  factoring_rate_pct: number | null;
  credit_line_apr_pct: number | null;
  bank_account_verified: number;
  bank_account_last4: string;
  bank_account_last_changed: string;
}

export interface Shipment {
  shipment_id: string;
  payer_id: string;
  shipper_id: string;
  carrier_id: string;
  mode: string;
  origin_city: string;
  origin_state: string;
  origin_lat: number;
  origin_lon: number;
  dest_city: string;
  dest_state: string;
  dest_lat: number;
  dest_lon: number;
  consignee: string;
  expected_route_mi: number;
  pickup_ts: string;
  scheduled_delivery_ts: string;
  booked_rate_cents: number;
  fuel_surcharge_pct: number;
  approved_max_cents: number;
  factoring_rate_pct: number;
  currency: string;
  virtual_card_id: string;
  scenario: string;
  carrier_bank_change_request_date: string | null;
}

export interface TrackingEvent {
  event_id: string;
  event_type: string;
  ts: string;
  lat: number;
  lon: number;
  source: string;
  off_route_mi: number;
  recipient: string | null;
  // Why a DELAYED, EXCEPTION or ON_HOLD event happened, e.g. "ETA +3.1 h", "damaged", "held at customer request".
  reason: string | null;
}

// Proof of delivery. kind: rfid_scan, signature or photo.
export interface DeliveryEvidence {
  evidence_id: string;
  kind: string;
  ts: string;
  lat: number;
  lon: number;
  source: string;
  recipient: string | null;
}

export interface Invoice {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  base_cents: number;
  fuel_cents: number;
  detention_cents: number;
  liftgate_cents: number;
  reweigh_cents: number;
  total_cents: number;
  currency: string;
  duplicate_of: string | null;
}

export interface RateRule {
  charge_type: string;
  allowed: number;
  max_cents_per_shipment: number | null;
  cap_note: string | null;
}

export interface ShipmentDetail {
  shipment: Shipment;
  payer: Payer;
  shipper: Shipper;
  carrier: Carrier;
  events: TrackingEvent[];
  evidence: DeliveryEvidence[];
  invoices: Invoice[];
  rate_rules: RateRule[];
  decision: DecisionRecord | null;
  review: Review | null;
}

export interface ShipmentNeighbors {
  position: number | null; // 1-based place in the filtered list; null if this shipment isn't in it
  total: number;
  prev: string | null;
  next: string | null;
}

// The forwarder dashboard, for one forwarder (payer) or all of them.
export interface Dashboard {
  payer: Payer | null;          // null = all forwarders
  payers: Option[];
  period: { from: string; to: string }; // first and last tracking update in the sample data
  totals: {
    shipments: number;
    paid: number;               // paid automatically (including duplicates blocked)
    held: number;
    awaiting_delivery: number;
    paid_within_24h: number;    // paid loads funded within 24 hours of delivery
    avg_hours_to_funds: number | null;
    max_hours_to_funds: number | null;
    avg_float_days: number | null;
    paid_cents: number;
    fees_total_cents: number;
    fees_forwarder_cents: number;
    fees_carrier_cents: number;
    factoring_avoided_cents: number;
  };
  reviews: { awaiting_review: number; released: number; rejected: number; oldest_days_waiting: number | null };
  card_bills: { due_date: string; loads: number; invoice_cents: number; forwarder_fee_cents: number; total_cents: number }[];
  holds_by_reason: { reason: HoldReason; count: number }[];
  queue: { shipment_id: string; carrier_name: string; invoice_cents: number | null; reasons: HoldReason[]; held_since: string; days_waiting: number }[];
  carriers: {
    carrier_id: string; name: string; segment: string; cash_preference: string; credit_line_apr_pct: number | null;
    loads: number; paid: number; held: number; paid_cents: number; avg_hours_to_funds: number | null;
    fees_paid_by_carrier_cents: number;
    factoring_avoided_cents: number; // factoring at each load's rate, for carriers that factor today
    paid_cent_days: number;          // sum of invoice cents x days the carrier would otherwise wait (forwarder's terms)
  }[];
}
