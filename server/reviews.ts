// Forwarder reviews of held payments: release or reject, plus an audit log of every review action.
// The database is rebuilt from the CSVs on every start, so reviews and the audit log are also kept
// in JSON files (var/reviews.json, var/audit.json) and loaded back in. Tests pass no file and keep
// both in memory only.
import type { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuditEntry, DecisionRecord, Review } from '../shared/decisions.ts';
import { canRelease } from './payouts.ts';

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
  // Append-only: an undo is a new entry, not a deletion.
  db.exec(`CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('released', 'rejected', 'review_undone', 'info_requested')),
    shipment_id TEXT NOT NULL REFERENCES shipments(shipment_id),
    note TEXT
  )`);
}

const stamp = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export class ReviewStore {
  private db: DatabaseSync;
  private file: string | null;
  private auditFile: string | null;

  constructor(db: DatabaseSync, file: string | null = null) {
    this.db = db;
    this.file = file;
    this.auditFile = file ? join(dirname(file), 'audit.json') : null;
    if (file && existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Review>;
      const insert = db.prepare('INSERT OR REPLACE INTO reviews VALUES (?, ?, ?, ?, ?)');
      for (const [id, r] of Object.entries(saved)) {
        // Skip reviews that no longer apply (e.g. after the sample data changed).
        const d = this.decision(id);
        if (d?.decision === 'held_for_review' && (r.status === 'rejected' || canRelease(d))) {
          insert.run(id, r.status, r.note, r.reviewed_ts, r.reviewed_by);
        }
      }
    }
    if (this.auditFile && existsSync(this.auditFile)) {
      const insert = db.prepare('INSERT INTO audit_log (id, ts, actor, action, shipment_id, note) VALUES (?, ?, ?, ?, ?, ?)');
      const known = db.prepare('SELECT 1 FROM shipments WHERE shipment_id = ?');
      for (const e of JSON.parse(readFileSync(this.auditFile, 'utf8')) as AuditEntry[]) {
        if (known.get(e.shipment_id)) insert.run(e.id, e.ts, e.actor, e.action, e.shipment_id, e.note);
      }
    }
  }

  get(shipmentId: string): Review | null {
    return (this.db.prepare('SELECT status, note, reviewed_ts, reviewed_by FROM reviews WHERE shipment_id = ?')
      .get(shipmentId) as unknown as Review | undefined) ?? null;
  }

  // Release or reject a held payment. A decided review can be undone (for demos) and decided again.
  decide(shipmentId: string, status: Review['status'], note: string | null, now = new Date()): Review {
    const d = this.decision(shipmentId);
    if (d?.decision !== 'held_for_review') throw new ReviewError(`${shipmentId} has no payment held for review`, 409);
    if (this.get(shipmentId)) throw new ReviewError(`${shipmentId} has already been reviewed`, 409);
    if (status === 'released' && !canRelease(d)) {
      throw new ReviewError(`${shipmentId} wasn't delivered, so its payment can't be released; it can only be rejected`, 409);
    }
    const review: Review = { status, note: note?.trim() || null, reviewed_ts: stamp(now), reviewed_by: DEMO_REVIEWER };
    this.db.prepare('INSERT INTO reviews VALUES (?, ?, ?, ?, ?)')
      .run(shipmentId, review.status, review.note, review.reviewed_ts, review.reviewed_by);
    this.log(shipmentId, status, review.note, now);
    this.save();
    return review;
  }

  // Ask the carrier for more information. The payment stays held and awaiting review.
  requestInfo(shipmentId: string, note: string, now = new Date()) {
    if (this.decision(shipmentId)?.decision !== 'held_for_review') throw new ReviewError(`${shipmentId} has no payment held for review`, 409);
    if (this.get(shipmentId)) throw new ReviewError(`${shipmentId} has already been reviewed`, 409);
    if (!note.trim()) throw new ReviewError('Say what information is needed', 400);
    this.log(shipmentId, 'info_requested', note.trim(), now);
    this.save();
  }

  undo(shipmentId: string, now = new Date()) {
    if (!this.get(shipmentId)) return;
    this.db.prepare('DELETE FROM reviews WHERE shipment_id = ?').run(shipmentId);
    this.log(shipmentId, 'review_undone', null, now);
    this.save();
  }

  private decision(shipmentId: string): DecisionRecord | null {
    const row = this.db.prepare('SELECT record FROM decisions WHERE shipment_id = ?').get(shipmentId) as { record: string } | undefined;
    return row ? JSON.parse(row.record) as DecisionRecord : null;
  }

  private log(shipmentId: string, action: AuditEntry['action'], note: string | null, now: Date) {
    this.db.prepare('INSERT INTO audit_log (ts, actor, action, shipment_id, note) VALUES (?, ?, ?, ?, ?)')
      .run(stamp(now), DEMO_REVIEWER, action, shipmentId, note);
  }

  private save() {
    if (!this.file || !this.auditFile) return;
    const rows = this.db.prepare('SELECT shipment_id, status, note, reviewed_ts, reviewed_by FROM reviews ORDER BY shipment_id')
      .all() as unknown as (Review & { shipment_id: string })[];
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(Object.fromEntries(rows.map(({ shipment_id, ...r }) => [shipment_id, r])), null, 2));
    writeFileSync(this.auditFile, JSON.stringify(this.db.prepare('SELECT * FROM audit_log ORDER BY id').all(), null, 2));
  }
}
