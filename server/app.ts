import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { getShipment, listShipments } from './queries.ts';

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);

export function createApp(db: DatabaseSync) {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/shipments', (req, res) => {
    const { payer_id, shipper_id, carrier_id, segment, scenario, q } = req.query;
    res.json(listShipments(db, {
      payer_id: str(payer_id), shipper_id: str(shipper_id), carrier_id: str(carrier_id),
      segment: str(segment), scenario: str(scenario), q: str(q),
    }));
  });

  app.get('/api/shipments/:id', (req, res) => {
    const detail = getShipment(db, req.params.id);
    if (!detail) {
      res.status(404).json({ error: `No shipment with ID ${req.params.id}` });
      return;
    }
    res.json(detail);
  });

  return app;
}
