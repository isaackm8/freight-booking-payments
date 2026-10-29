// Decision engine output, shared by the server and the UI. Money is integer cents.

// Plain-language text for each hold reason, in rule order.
export const HOLD_REASONS = {
  amount_above_approved_range: 'Invoice total is above the approved maximum',
  off_route: 'Truck went off the expected route in transit',
  delivered_to_unexpected_recipient: 'Delivered to someone other than the consignee',
  bank_account_changed_recently: "Carrier's bank details changed shortly before payment",
  duplicate_invoice_received: 'A second invoice arrived for this shipment; it was blocked and the original paid once',
  missing_proof_of_delivery: 'No proof of delivery (RFID scan, signature or photo)',
  delivery_exception: 'Carrier reported a delivery exception',
  shipment_on_hold: 'Load is on hold and not delivered yet',
} as const;
export type HoldReason = keyof typeof HOLD_REASONS;

export const DECISION_LABELS = {
  auto_approved: 'Paid',
  auto_approved_duplicate_blocked: 'Paid, duplicate blocked',
  held_for_review: 'Payment held',
  awaiting_delivery: 'Awaiting delivery',
} as const;
export type DecisionKind = keyof typeof DECISION_LABELS;

export interface Decision {
  decision: DecisionKind;
  reasons: HoldReason[];
  delivered_ts: string | null;
  decided_ts: string | null;       // when the engine decided: 1 hour after delivery (or the failed delivery)
  paid_invoice_id: string | null;
  blocked_invoice_ids: string[];
  amount_cents: number;            // 0 unless paid
  card_charge_ts: string | null;   // null unless paid
  statement_due_date: string | null;
}

export interface Settlement {
  carrier_funds_ts: string;
  hours_delivery_to_funds: number;
  float_days: number;                // card bill due date - day the carrier got its money
  interchange_cents: number;         // to the card issuer
  issuer_funding_cost_cents: number; // the issuer's cost of fronting the money for the float days
  network_fee_cents: number;         // to the card network
  provider_margin_cents: number;     // to the card-to-account provider
  total_fee_cents: number;           // interchange + provider margin
  fee_paid_by_carrier_cents: number;
  fee_paid_by_payer_cents: number;
  carrier_factoring_avoided_cents: number; // what factoring this load would have cost a carrier that factors
}

// A forwarder's review of a held payment.
export const REVIEW_LABELS = {
  awaiting_review: 'Awaiting forwarder review',
  released: 'Released by forwarder',
  rejected: 'Rejected by forwarder',
} as const;
export type ReviewStatus = keyof typeof REVIEW_LABELS;

export interface Review {
  status: Exclude<ReviewStatus, 'awaiting_review'>;
  note: string | null;
  reviewed_ts: string;
  reviewed_by: string;
}

// A decision plus, once the provider reports the payout, its timing and fees.
export interface DecisionRecord extends Decision {
  settlement: Settlement | null;
}
