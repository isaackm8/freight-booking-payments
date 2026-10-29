// Forwarder reviews of held payments, and previous / next navigation between shipments.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDatabase } from './db.ts';
import { createApp } from './app.ts';
import { ReviewStore } from './reviews.ts';
import { listShipments } from './queries.ts';
import { DATA_DIR } from './paths.ts';
import type { ShipmentDetail, ShipmentNeighbors } from '../shared/types.ts';

let db: DatabaseSync;
let server: Server;
let baseUrl: string;
let dir: string;
let file: string;

const HELD = 'SHP-10058';   // off route
const PAID = 'SHP-10001';

before(async () => {
  ({ db } = loadDatabase(DATA_DIR, ':memory:'));
  dir = mkdtempSync(join(tmpdir(), 'cashbridge-reviews-'));
  file = join(dir, 'reviews.json');
  server = createApp(db, new ReviewStore(db, file)).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}${path}`, init);
const review = (id: string, body: unknown) =>
  api(`/api/shipments/${id}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const detail = async (id: string) => (await (await api(`/api/shipments/${id}`)).json()) as ShipmentDetail;

test('every held payment starts out awaiting the forwarder’s review', () => {
  const awaiting = listShipments(db, { review: 'awaiting_review' });
  assert.equal(awaiting.total, 50);
  assert.equal(awaiting.awaiting_review_total, 50);
  assert.ok(awaiting.shipments.every((s) => s.decision === 'held_for_review'));
  assert.ok(listShipments(db, { decision: 'auto_approved' }).shipments.every((s) => s.review_status === null));
});

test('a held payment can be released, and the review is saved to the file', async () => {
  const res = await review(HELD, { status: 'released', note: 'Detour confirmed with the carrier' });
  assert.equal(res.status, 200);
  const d = await detail(HELD);
  assert.equal(d.review?.status, 'released');
  assert.equal(d.review?.note, 'Detour confirmed with the carrier');
  assert.equal(listShipments(db).awaiting_review_total, 49);
  assert.equal(listShipments(db, { review: 'released' }).shipments[0].shipment_id, HELD);
  assert.equal((JSON.parse(readFileSync(file, 'utf8')) as Record<string, { status: string }>)[HELD].status, 'released');
});

test('a review can’t be decided twice, but can be undone and decided again', async () => {
  assert.equal((await review(HELD, { status: 'rejected' })).status, 409);
  assert.equal((await api(`/api/shipments/${HELD}/review`, { method: 'DELETE' })).status, 204);
  assert.equal((await detail(HELD)).review, null);
  assert.equal((await review(HELD, { status: 'rejected' })).status, 200);
  assert.equal((await detail(HELD)).review?.status, 'rejected');
});

test('reviews survive a restart: a new store loads them from the file', () => {
  const { db: fresh } = loadDatabase(DATA_DIR, ':memory:');
  const store = new ReviewStore(fresh, file);
  assert.equal(store.get(HELD)?.status, 'rejected');
  fresh.close();
});

test('only held payments can be reviewed, and the status must be release or reject', async () => {
  assert.equal((await review(PAID, { status: 'released' })).status, 409);
  assert.equal((await review('SHP-10338', { status: 'released' })).status, 409); // on hold, awaiting delivery
  assert.equal((await review(HELD, { status: 'approve' })).status, 400);
});

test('previous / next follow the list order and its filters', async () => {
  const all = (await (await api('/api/shipments/SHP-10002/neighbors')).json()) as ShipmentNeighbors;
  assert.deepEqual(all, { position: 2, total: 500, prev: 'SHP-10001', next: 'SHP-10003' });

  const first = (await (await api('/api/shipments/SHP-10001/neighbors')).json()) as ShipmentNeighbors;
  assert.equal(first.prev, null);

  const held = listShipments(db, { decision: 'held_for_review' }).shipments.map((s) => s.shipment_id);
  const n = (await (await api(`/api/shipments/${held[1]}/neighbors?decision=held_for_review`)).json()) as ShipmentNeighbors;
  assert.deepEqual(n, { position: 2, total: 50, prev: held[0], next: held[2] });
});

test('a shipment that just left a filtered list still has neighbors in it', async () => {
  // HELD was reviewed above, so it is no longer awaiting review.
  const ids = listShipments(db, { review: 'awaiting_review' }).shipments.map((s) => s.shipment_id);
  const n = (await (await api(`/api/shipments/${HELD}/neighbors?review=awaiting_review`)).json()) as ShipmentNeighbors;
  assert.equal(n.position, null);
  assert.equal(n.prev, ids.filter((id) => id < HELD).at(-1));
  assert.equal(n.next, ids.find((id) => id > HELD));
});
