// Loads the synthetic sample CSVs into SQLite.
// Conventions from the build plan: money is stored as integer cents,
// timestamps as UTC ISO strings, and every record links through shipment_id.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { runDecisions } from './decisions.ts';
import { createReviewsTable } from './reviews.ts';

// Column kinds:
//   text  - stored as is ('' becomes NULL)
//   int   - integer
//   real  - decimal number that is not money (rates, miles, coordinates)
//   bool  - 'True'/'False' -> 1/0
//   cents - a *_usd money column, stored as integer cents under a *_cents name
//   ts    - timestamp with no zone in the CSV, treated as UTC and stored with 'Z'
type Kind = 'text' | 'int' | 'real' | 'bool' | 'cents' | 'ts';

interface TableSpec {
  table: string;
  file: string;
  primaryKey: string[];
  columns: Record<string, Kind>;
  references?: Record<string, string>;
  // Columns not in the CSV, filled in by `prepare` from the row.
  derived?: string[];
  prepare?: (row: Record<string, string>) => Record<string, string>;
}

export const TABLES: TableSpec[] = [
  {
    table: 'payers',
    file: 'payers.csv',
    primaryKey: ['payer_id'],
    columns: {
      payer_id: 'text', name: 'text', payer_type: 'text', service_level: 'text', issuer: 'text', network: 'text',
      credit_limit_usd: 'cents', customer_terms_days: 'int', current_terms_to_carriers_days: 'int',
      statement_close_day: 'text', grace_days: 'int', fee_model: 'text',
    },
  },
  {
    // The forwarders' customers. Each shipper uses one forwarder.
    table: 'shippers',
    file: 'shippers.csv',
    primaryKey: ['shipper_id'],
    columns: { shipper_id: 'text', name: 'text', payer_id: 'text', industry: 'text' },
    references: { payer_id: 'payers' },
  },
  {
    table: 'carriers',
    file: 'carriers.csv',
    primaryKey: ['carrier_id'],
    columns: {
      carrier_id: 'text', name: 'text', usdot_number: 'text', mc_number: 'text',
      fleet_size: 'int', segment: 'text', accepts_cards: 'bool', cash_preference: 'text',
      factoring_rate_pct: 'real', credit_line_apr_pct: 'real', bank_account_verified: 'bool',
      bank_account_last4: 'text', bank_account_last_changed: 'text',
    },
  },
  {
    table: 'rate_rules',
    file: 'rate_rules.csv',
    primaryKey: ['payer_id', 'charge_type'],
    columns: {
      payer_id: 'text', charge_type: 'text', allowed: 'bool', max_usd_per_shipment: 'cents', cap_note: 'text',
    },
    references: { payer_id: 'payers' },
    // Fuel surcharge has no dollar cap ("indexed weekly"): keep that text as a note and leave the cap empty.
    derived: ['cap_note'],
    prepare: (row) => {
      const cap = row.max_usd_per_shipment;
      return cap === '' || Number.isFinite(Number(cap))
        ? { ...row, cap_note: '' }
        : { ...row, max_usd_per_shipment: '', cap_note: cap };
    },
  },
  {
    // diesel_usd_per_gal is an index price, not money that moves, so it stays a decimal.
    table: 'fuel_index',
    file: 'fuel_index.csv',
    primaryKey: ['week_start'],
    columns: { week_start: 'text', diesel_usd_per_gal: 'real', fuel_surcharge_pct: 'real', note: 'text' },
  },
  {
    table: 'shipments',
    file: 'shipments.csv',
    primaryKey: ['shipment_id'],
    columns: {
      shipment_id: 'text', payer_id: 'text', shipper_id: 'text', carrier_id: 'text', mode: 'text',
      origin_city: 'text', origin_state: 'text', origin_lat: 'real', origin_lon: 'real',
      dest_city: 'text', dest_state: 'text', dest_lat: 'real', dest_lon: 'real',
      consignee: 'text', expected_route_mi: 'real', pickup_ts: 'ts', scheduled_delivery_ts: 'ts',
      booked_rate_usd: 'cents', fuel_surcharge_pct: 'real', approved_max_usd: 'cents',
      factoring_rate_pct: 'real', currency: 'text', virtual_card_id: 'text', scenario: 'text',
      carrier_bank_change_request_date: 'text',
    },
    references: { payer_id: 'payers', shipper_id: 'shippers', carrier_id: 'carriers' },
  },
  {
    // Shipment milestones: BOOKED, PICKED_UP, IN_TRANSIT, DELAYED, DELIVERED, EXCEPTION, ON_HOLD.
    table: 'tracking_events',
    file: 'tracking_events.csv',
    primaryKey: ['event_id'],
    columns: {
      event_id: 'text', shipment_id: 'text', event_type: 'text', ts: 'ts', lat: 'real', lon: 'real',
      source: 'text', off_route_mi: 'real', recipient: 'text', reason: 'text',
    },
    references: { shipment_id: 'shipments' },
  },
  {
    // Proof of delivery: an RFID dock-door scan, a signature or a photo. Not a milestone.
    table: 'delivery_evidence',
    file: 'delivery_evidence.csv',
    primaryKey: ['evidence_id'],
    columns: {
      evidence_id: 'text', shipment_id: 'text', kind: 'text', ts: 'ts', lat: 'real', lon: 'real',
      source: 'text', recipient: 'text',
    },
    references: { shipment_id: 'shipments' },
  },
  {
    table: 'invoices',
    file: 'invoices.csv',
    primaryKey: ['invoice_id'],
    columns: {
      invoice_id: 'text', shipment_id: 'text', carrier_id: 'text', invoice_number: 'text',
      invoice_date: 'text', base_usd: 'cents', fuel_usd: 'cents', detention_usd: 'cents',
      liftgate_usd: 'cents', reweigh_usd: 'cents', total_usd: 'cents', currency: 'text',
      duplicate_of: 'text',
    },
    references: { shipment_id: 'shipments', carrier_id: 'carriers' },
  },
  {
    // The simulated card-to-account provider's report: when each paid carrier received its money.
    table: 'provider_payouts',
    file: 'provider_payouts.csv',
    primaryKey: ['payout_id'],
    columns: { payout_id: 'text', shipment_id: 'text', carrier_funds_ts: 'ts' },
    references: { shipment_id: 'shipments' },
  },
  {
    // Answer key for tests only; the app's own payments come from the decision engine (phase 2).
    table: 'payments_expected',
    file: 'payments_expected.csv',
    primaryKey: ['payment_id'],
    columns: {
      payment_id: 'text', shipment_id: 'text', expected_decision: 'text', hold_reasons: 'text',
      amount_paid_usd: 'cents', card_charge_ts: 'ts', carrier_funds_ts: 'ts',
      hours_delivery_to_funds: 'real', payer_statement_due_date: 'text', float_days: 'int',
      fee_model: 'text', interchange_usd: 'cents', issuer_funding_cost_usd: 'cents',
      network_fee_usd: 'cents', provider_margin_usd: 'cents', total_fee_usd: 'cents',
      fee_paid_by_carrier_usd: 'cents', fee_paid_by_payer_usd: 'cents',
      carrier_factoring_avoided_usd: 'cents',
    },
    references: { shipment_id: 'shipments' },
  },
];

const SQL_TYPE: Record<Kind, string> = {
  text: 'TEXT', int: 'INTEGER', real: 'REAL', bool: 'INTEGER', cents: 'INTEGER', ts: 'TEXT',
};

export const columnName = (csvColumn: string, kind: Kind) =>
  kind === 'cents' ? csvColumn.replace(/_usd/, '_cents') : csvColumn;

function convert(value: string, kind: Kind, where: string): string | number | null {
  if (value === '') return null;
  switch (kind) {
    case 'text': return value;
    case 'int':
    case 'real':
    case 'cents': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`${where}: not a number: ${value}`);
      if (kind === 'cents') return Math.round(n * 100);
      if (kind === 'int' && !Number.isInteger(n)) throw new Error(`${where}: not an integer: ${value}`);
      return n;
    }
    case 'bool':
      if (value === 'True') return 1;
      if (value === 'False') return 0;
      throw new Error(`${where}: not True/False: ${value}`);
    case 'ts':
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) throw new Error(`${where}: bad timestamp: ${value}`);
      return `${value}Z`;
  }
}

function createTable(db: DatabaseSync, spec: TableSpec) {
  const cols = Object.entries(spec.columns).map(([c, kind]) => `${columnName(c, kind)} ${SQL_TYPE[kind]}`);
  const refs = Object.entries(spec.references ?? {}).map(
    ([c, table]) => `FOREIGN KEY (${c}) REFERENCES ${table}(${c})`,
  );
  db.exec(`CREATE TABLE ${spec.table} (${[...cols, `PRIMARY KEY (${spec.primaryKey.join(', ')})`, ...refs].join(', ')})`);
}

function loadTable(db: DatabaseSync, spec: TableSpec, dataDir: string): number {
  const rows: Record<string, string>[] = parse(readFileSync(join(dataDir, spec.file), 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });
  const allCols = Object.keys(spec.columns);
  const csvCols = allCols.filter((c) => !spec.derived?.includes(c));
  const header = Object.keys(rows[0] ?? {});
  const missing = csvCols.filter((c) => !header.includes(c));
  const extra = header.filter((c) => !csvCols.includes(c));
  if (missing.length || extra.length) {
    throw new Error(`${spec.file}: columns differ from schema (missing: ${missing}, unexpected: ${extra})`);
  }
  const names = allCols.map((c) => columnName(c, spec.columns[c]));
  const insert = db.prepare(
    `INSERT INTO ${spec.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
  );
  rows.forEach((raw, i) => {
    const row = spec.prepare ? spec.prepare(raw) : raw;
    insert.run(...allCols.map((c) => convert(row[c], spec.columns[c], `${spec.file} row ${i + 2}, ${c}`)));
  });
  return rows.length;
}

const INDEXES = [
  'CREATE INDEX idx_shipments_carrier ON shipments(carrier_id)',
  'CREATE INDEX idx_shipments_payer ON shipments(payer_id)',
  'CREATE INDEX idx_events_shipment ON tracking_events(shipment_id, ts)',
  'CREATE INDEX idx_evidence_shipment ON delivery_evidence(shipment_id, ts)',
  'CREATE INDEX idx_invoices_shipment ON invoices(shipment_id)',
  'CREATE INDEX idx_expected_shipment ON payments_expected(shipment_id)',
  'CREATE UNIQUE INDEX idx_payouts_shipment ON provider_payouts(shipment_id)',
];

// Builds a fresh database from the CSVs, then runs the decision engine for every shipment.
// Pass ':memory:' for tests.
export function loadDatabase(dataDir: string, dbPath: string): { db: DatabaseSync; counts: Record<string, number> } {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
    rmSync(dbPath, { force: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  const counts: Record<string, number> = {};
  db.exec('BEGIN');
  try {
    for (const spec of TABLES) {
      createTable(db, spec);
      counts[spec.table] = loadTable(db, spec, dataDir);
    }
    for (const sql of INDEXES) db.exec(sql);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    db.close();
    throw err;
  }
  createReviewsTable(db);
  counts.decisions = runDecisions(db);
  return { db, counts };
}
