// A shipment's history, in the order things happened: the engine's decision, the forwarder's
// review actions (from the audit log), and the payment.
import { DECISION_LABELS, HOLD_REASONS, type AuditEntry, type DecisionRecord, type HistoryEntry } from '../shared/decisions.ts';

const ENGINE = 'CashBridge engine';
const PROVIDER = 'Payment provider (simulated)';
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (cents: number) => usd.format(cents / 100);

const REVIEW_TEXT: Record<AuditEntry['action'], string> = {
  released: 'Released the held payment',
  rejected: 'Rejected the held payment',
  review_undone: 'Undid the review; the payment is held again',
};

export function shipmentHistory(
  decision: DecisionRecord | null,
  payment: DecisionRecord | null,
  audit: AuditEntry[],
  forwarderName: string,
): HistoryEntry[] {
  if (!decision) return [];
  if (decision.decision === 'awaiting_delivery') {
    return [{ ts: null, actor: ENGINE, kind: 'engine', text: 'No payment decision yet: the load is on hold and not delivered.' }];
  }

  const out: HistoryEntry[] = [];
  if (decision.decision === 'held_for_review') {
    out.push({
      ts: decision.decided_ts, actor: ENGINE, kind: 'engine',
      text: `Held the payment: ${decision.reasons.map((r) => HOLD_REASONS[r].toLowerCase()).join('; ')}.`,
    });
    out.push({
      ts: decision.decided_ts, actor: ENGINE, kind: 'engine',
      text: `Notified ${forwarderName}'s accounts payable team to review it (email and in-app, simulated).`,
    });
  } else {
    const blocked = decision.blocked_invoice_ids.length ? ` Blocked duplicate invoice ${decision.blocked_invoice_ids.join(', ')}.` : '';
    out.push({ ts: decision.decided_ts, actor: ENGINE, kind: 'engine', text: `${DECISION_LABELS[decision.decision]}: passed every hold rule.${blocked}` });
  }

  for (const a of audit) {
    out.push({ ts: a.ts, actor: a.actor, kind: 'review', text: a.note ? `${REVIEW_TEXT[a.action]}: “${a.note}”` : `${REVIEW_TEXT[a.action]}.` });
  }

  if (payment?.card_charge_ts) {
    out.push({ ts: payment.card_charge_ts, actor: ENGINE, kind: 'payment', text: `Charged the forwarder's card ${money(payment.amount_cents)} for invoice ${payment.paid_invoice_id}.` });
    const s = payment.settlement;
    if (s) {
      out.push({
        ts: s.carrier_funds_ts, actor: PROVIDER, kind: 'payment',
        text: `Paid the carrier ${money(payment.amount_cents - s.fee_paid_by_carrier_cents)} into its bank account.`,
      });
    }
  }
  return out;
}
