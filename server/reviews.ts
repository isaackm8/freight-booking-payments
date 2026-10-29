// Forwarder reviews of held payments: release or reject.
// The database is rebuilt from the CSVs on every start, so reviews are also kept in a JSON file
// (var/reviews.json) and loaded back in. Tests pass no file and keep reviews in memory only.
import type { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Review } from '../shared/decisions.ts';

// The demo has no sign-in yet, so every review is recorded against one demo reviewer.
export const DEMO_REVIEWER = "Forwarder's accounts payable (demo)";

export class ReviewError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function createReviewsTable(db: DatabaseSync) {
  db.exec(`CREATE TABLE reviews (
    shipment_id TEXT PRIMARY KEY REFERENCES shipments(shipment_id),
    status TEXT NOT NULL CHECK (status IN ('released', 'rejected')),
    note TEXT,
    reviewed_ts TEXT NOT NULL,
    reviewed_by TEXT NOT NULL
  )`);
}

export class ReviewStore {
  private db: DatabaseSync;
  private file: string | null;

  constructor(db: DatabaseSync, file: string | null = null) {
    this.db = db;
    this.file = file;
    if (file && existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Review>;
      const insert = db.prepare('INSERT OR REPLACE INTO reviews VALUES (?, ?, ?, ?, ?)');
      for (const [id, r] of Object.entries(saved)) {
        // Skip reviews for shipments that are no longer held (e.g. after the sample data changed).
        if (this.isHeld(id)) insert.run(id, r.status, r.note, r.reviewed_ts, r.reviewed_by);
      }
    }
  }

  get(shipmentId: string): Review | null {
    return (this.db.prepare('SELECT status, note, reviewed_ts, reviewed_by FROM reviews WHERE shipment_id = ?')
      .get(shipmentId) as unknown as Review | undefined) ?? null;
  }

  // Release or reject a held payment. A decided review can be undone (for demos) and decided again.
  decide(shipmentId: string, status: Review['status'], note: string | null, now = new Date()): Review {
    if (!this.isHeld(shipmentId)) throw new ReviewError(`${shipmentId} has no payment held for review`, 409);
    if (this.get(shipmentId)) throw new ReviewError(`${shipmentId} has already been reviewed`, 409);
    const review: Review = {
      status, note: note?.trim() || null, reviewed_ts: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), reviewed_by: DEMO_REVIEWER,
    };
    this.db.prepare('INSERT INTO reviews VALUES (?, ?, ?, ?, ?)')
      .run(shipmentId, review.status, review.note, review.reviewed_ts, review.reviewed_by);
    this.save();
    return review;
  }

  undo(shipmentId: string) {
    this.db.prepare('DELETE FROM reviews WHERE shipment_id = ?').run(shipmentId);
    this.save();
  }

  private isHeld(shipmentId: string) {
    return this.db.prepare("SELECT 1 FROM decisions WHERE shipment_id = ? AND decision = 'held_for_review'").get(shipmentId) !== undefined;
  }

  private save() {
    if (!this.file) return;
    const rows = this.db.prepare('SELECT shipment_id, status, note, reviewed_ts, reviewed_by FROM reviews ORDER BY shipment_id')
      .all() as unknown as (Review & { shipment_id: string })[];
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(Object.fromEntries(rows.map(({ shipment_id, ...r }) => [shipment_id, r])), null, 2));
  }
}
