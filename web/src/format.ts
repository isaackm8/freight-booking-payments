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
  snake.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()).replace(/\b(rfid|pod|api)\b/gi, (w) => w.toUpperCase());

export const EVENT_LABELS: Record<string, string> = {
  PICKUP: 'Picked up',
  IN_TRANSIT: 'In transit',
  RFID_SCAN: 'RFID scan',
  DELIVERED: 'Delivered',
  POD: 'Proof of delivery',
};
