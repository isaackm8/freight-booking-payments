// The review queue: held payments oldest first, filters, and asking the carrier for more information.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { loadDatabase } from './db.ts';
import { createApp } from './app.ts';
import { getShipment, reviewQueue } from './queries.ts';
import { ReviewStore } from './reviews.ts';
import { DATA_DIR } from './paths.ts';
import type { ReviewQueueResponse } from '../shared/types.ts';

let db: DatabaseSync;
let store: ReviewStore;
let server: Server;
let baseUrl: string;

before(async () => {
  ({ db } = loadDatabase(DATA_DIR, ':memory:'));
  store = new ReviewStore(db);
  server = createApp(db, store).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  db.close();
});

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('the queue holds every held payment, longest waiting first', () => {
  const q = reviewQueue(db);
  assert.equal(q.items.length, 50);
  assert.deepEqual(q.counts, { awaiting_review: 50, info_requested: 0, released: 0, rejected: 0 });
  assert.ok(q.items.every((i, n) => n === 0 || q.items[n - 1].held_since <= i.held_since));
  assert.ok(q.items.every((i, n) => n === 0 || q.items[n - 1].days_waiting >= i.days_waiting));
  assert.ok(q.items.every((i) => i.reasons.length > 0 && i.lane.includes('→')));
});

test('filtering by forwarder keeps only its payments, and the counts follow', () => {
  const total = ['PAY-01', 'PAY-02', 'PAY-03'].reduce((a, id) => {
    const q = reviewQueue(db, id);
    assert.ok(q.items.every((i) => i.payer_id === id));
    return a + q.counts.awaiting_review;
  }, 0);
  assert.equal(total, 50);
});

test('asking for info keeps the payment held, shows in the queue, and is logged', async () => {
  const id = reviewQueue(db).items[0].shipment_id;
  assert.equal((await post(`/api/shipments/${id}/request-info`, { note: '  ' })).status, 400);
  assert.equal((await post(`/api/shipments/${id}/request-info`, { note: 'Send the signed delivery receipt' })).status, 204);

  const d = getShipment(db, id)!;
  assert.deepEqual(d.info_request?.note, 'Send the signed delivery receipt');
  assert.equal(d.review, null);
  assert.equal(d.history.at(-1)?.kind, 'review');

  const q = (await (await fetch(`${baseUrl}/api/review-queue?status=info_requested`)).json()) as ReviewQueueResponse;
  assert.deepEqual(q.items.map((i) => i.shipment_id), [id]);
  assert.equal(q.counts.awaiting_review, 50); // still awaiting a decision

  // Deciding closes the request.
  store.decide(id, 'rejected', null);
  assert.equal(getShipment(db, id)!.info_request, null);
  assert.equal(reviewQueue(db, undefined, 'info_requested').items.length, 0);
  assert.deepEqual(reviewQueue(db, undefined, 'rejected').items.map((i) => i.shipment_id), [id]);
  store.undo(id);
});

test('only held payments that are still undecided can get an info request', async () => {
  assert.equal((await post('/api/shipments/SHP-10001/request-info', { note: 'Anything' })).status, 409); // paid automatically
  assert.equal((await fetch(`${baseUrl}/api/review-queue?status=bogus`)).status, 400);
});
