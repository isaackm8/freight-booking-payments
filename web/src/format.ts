const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const money = (cents: number | null | undefined) => (cents == null ? '—' : usd.format(cents / 100));

const dateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
});
const dateOnly = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// Timestamps are UTC, and shown in UTC so every viewer sees the same times.
export const when = (iso: string | null | undefined) => (iso ? `${dateTime.format(new Date(iso))} UTC` : '—');
export const day = (isoDate: string | null | undefined) => (isoDate ? dateOnly.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)) : '—');

export const pct = (n: number | null | undefined, digits = 1) => (n == null ? '—' : `${n.toFixed(digits)}%`);

// Every company in the sample data is fictional; the banner already says so, so drop the suffix.
export const companyName = (name: string) => name.replace(/\s*\(fictional[^)]*\)/, '');

export const label = (snake: string) =>
  snake.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()).replace(/\b(rfid|pod|api|tms)\b/gi, (w) => w.toUpperCase());

// Shipment milestones, in the order a load normally moves through them.
export const EVENT_LABELS: Record<string, string> = {
  BOOKED: 'Booked',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  DELAYED: 'Delayed',
  DELIVERED: 'Delivered',
  EXCEPTION: 'Exception',
  ON_HOLD: 'On hold',
};

// Milestones that need attention, and the text color that flags them.
export const EVENT_TONE: Record<string, string> = {
  DELAYED: 'text-amber-800',
  ON_HOLD: 'text-amber-800',
  EXCEPTION: 'text-red-700',
};

// Kinds of proof of delivery.
export const EVIDENCE_LABELS: Record<string, string> = {
  rfid_scan: 'RFID scan',
  signature: 'Signature',
  photo: 'Photo',
};

export const EXCEPTION_LABELS: Record<string, string> = {
  damaged: 'Damaged',
  refused: 'Refused by consignee',
  shortage: 'Short (pieces missing)',
};
