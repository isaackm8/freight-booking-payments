import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import {
  FILTER_KEYS, auditLog, getShipment, listShipments, reviewQueue, shipmentNeighbors, type ShipmentFilters,
} from './queries.ts';
import type { QueueStatus } from '../shared/types.ts';
import { ReviewError, ReviewStore } from './reviews.ts';
import { getDashboard } from './dashboard.ts';

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);

const filtersFrom = (query: Record<string, unknown>): ShipmentFilters =>
  Object.fromEntries(FILTER_KEYS.map((k) => [k, str(query[k])]).filter(([, v]) => v));

export function createApp(db: DatabaseSync, reviews = new ReviewStore(db)) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ?payer_id=PAY-01 for one forwarder; omit it for all forwarders.
  app.get('/api/dashboard', (req, res) => {
    const dashboard = getDashboard(db, str(req.query.payer_id));
    if (!dashboard) {
      res.status(404).json({ error: `No forwarder with ID ${req.query.payer_id}` });
      return;
    }
    res.json(dashboard);
  });

  // ?payer_id= for one forwarder; ?status= awaiting_review (default), info_requested, released, rejected or all.
  app.get('/api/review-queue', (req, res) => {
    const status = str(req.query.status) ?? 'awaiting_review';
    if (!['awaiting_review', 'info_requested', 'released', 'rejected', 'all'].includes(status)) {
      res.status(400).json({ error: `Unknown status ${status}` });
      return;
    }
    res.json(reviewQueue(db, str(req.query.payer_id), status as QueueStatus));
  });

  app.get('/api/audit-log', (_req, res) => {
    res.json(auditLog(db));
  });

  app.get('/api/shipments', (req, res) => {
    res.json(listShipments(db, filtersFrom(req.query)));
  });

  app.get('/api/shipments/:id', (req, res) => {
    const detail = getShipment(db, req.params.id);
    if (!detail) {
      res.status(404).json({ error: `No shipment with ID ${req.params.id}` });
      return;
    }
    res.json(detail);
  });

  app.get('/api/shipments/:id/neighbors', (req, res) => {
    res.json(shipmentNeighbors(db, req.params.id, filtersFrom(req.query)));
  });

  // The forwarder releases or rejects a held payment: { status: 'released' | 'rejected', note? }.
  app.post('/api/shipments/:id/review', (req, res) => {
    const { status, note } = (req.body ?? {}) as { status?: unknown; note?: unknown };
    if (status !== 'released' && status !== 'rejected') {
      res.status(400).json({ error: "status must be 'released' or 'rejected'" });
      return;
    }
    try {
      res.json(reviews.decide(req.params.id, status, typeof note === 'string' ? note : null));
    } catch (err) {
      if (!(err instanceof ReviewError)) throw err;
      res.status(err.status).json({ error: err.message });
    }
  });

  // Ask the carrier for more information: { note }. The payment stays held.
  app.post('/api/shipments/:id/request-info', (req, res) => {
    const { note } = (req.body ?? {}) as { note?: unknown };
    try {
      reviews.requestInfo(req.params.id, typeof note === 'string' ? note : '');
      res.status(204).end();
    } catch (err) {
      if (!(err instanceof ReviewError)) throw err;
      res.status(err.status).json({ error: err.message });
    }
  });

  // Undo a review (for demos): the payment goes back to awaiting review.
  app.delete('/api/shipments/:id/review', (req, res) => {
    reviews.undo(req.params.id);
    res.status(204).end();
  });

  return app;
}
