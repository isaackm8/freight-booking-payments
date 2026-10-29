// Shapes returned by the API. Money is integer cents; timestamps are UTC ISO strings.

export interface ShipmentSummary {
  shipment_id: string;
  payer_id: string;
  payer_name: string;
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
}

export interface ShipmentListResponse {
  total: number;
  shipments: ShipmentSummary[];
  filters: { payers: Option[]; carriers: Option[]; segments: string[]; scenarios: string[] };
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
  expected_route_km: number;
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
  off_route_km: number;
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
  carrier: Carrier;
  events: TrackingEvent[];
  invoices: Invoice[];
  rate_rules: RateRule[];
}
