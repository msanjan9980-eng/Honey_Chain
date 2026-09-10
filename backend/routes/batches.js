import { Router } from 'express';
import QRCode from 'qrcode';
import { db } from '../db/database.js';
import { requireApiKey } from '../middleware/auth.js';

const router = Router();

/* ---------- helpers ---------- */

function normalizeId(raw) {
  return String(raw || '').trim().toUpperCase();
}

// Accepts "HC-2026-0842", full URLs with ?batch=, or /verify/HC-...
function extractBatchId(input) {
  if (!input) return '';
  const s = String(input).trim();

  // Try URL parse
  try {
    const u = new URL(s);
    const fromQuery = u.searchParams.get('batch');
    if (fromQuery) return normalizeId(fromQuery);
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return normalizeId(last);
  } catch { /* not a URL */ }

  // Plain batch ID
  return normalizeId(s);
}

function buildBatchResponse(row) {
  if (!row) return null;

  const events = db.prepare(
    `SELECT event_type, event_date, location, actor, notes, onchain_tx
     FROM batch_events WHERE batch_id = ? ORDER BY event_date ASC, id ASC`
  ).all(row.id);

  const hive = db.prepare(
    `SELECT id, name, latitude, longitude, current_health, current_weight, last_updated
     FROM hives WHERE id = ?`
  ).get(row.hive_id);

  return {
    batchId: row.id,
    verified: row.status === 'verified',
    beekeeper: row.beekeeper_name,
    location: row.location,
    harvestDate: row.harvest_date,
    healthAtHarvest: row.health_at_harvest,
    healthLabel: row.health_label,
    weightKg: row.weight_kg,
    moisturePct: row.moisture_pct,
    onchainHash: row.onchain_hash,
    blockNumber: row.block_number,
    ipfsCid: row.ipfs_cid,
    status: row.status,
    hive: hive ? {
      id: hive.id,
      name: hive.name,
      coordinates: { lat: hive.latitude, lng: hive.longitude },
      currentHealth: hive.current_health,
      currentWeight: hive.current_weight,
      lastUpdated: hive.last_updated
    } : null,
    events: events.map(e => ({
      type: e.event_type,
      date: e.event_date,
      location: e.location,
      actor: e.actor,
      notes: e.notes,
      onchainTx: e.onchain_tx
    }))
  };
}

/* ---------- GET /api/batches/:id ---------- */

router.get('/:id', (req, res, next) => {
  try {
    const id = extractBatchId(req.params.id);

    const row = db.prepare(`
      SELECT b.*, k.name AS beekeeper_name
      FROM batches b
      JOIN beekeepers k ON k.id = b.beekeeper_id
      WHERE b.id = ?
    `).get(id);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found',
        batchId: id
      });
    }

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ success: true, data: buildBatchResponse(row) });
  } catch (e) { next(e); }
});

/* ---------- GET /api/batches ---------- */

router.get('/', (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT b.id, b.harvest_date, b.location, b.health_at_harvest, b.health_label,
             b.status, k.name AS beekeeper_name
      FROM batches b
      JOIN beekeepers k ON k.id = b.beekeeper_id
      ORDER BY b.harvest_date DESC
    `).all();

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(r => ({
        batchId: r.id,
        beekeeper: r.beekeeper_name,
        location: r.location,
        harvestDate: r.harvest_date,
        healthAtHarvest: r.health_at_harvest,
        healthLabel: r.health_label,
        verified: r.status === 'verified'
      }))
    });
  } catch (e) { next(e); }
});

/* ---------- GET /api/batches/:id/qr ---------- */

router.get('/:id/qr', async (req, res, next) => {
  try {
    const id = extractBatchId(req.params.id);
    const row = db.prepare('SELECT id FROM batches WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ success: false, error: 'Batch not found' });

    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';
    const target = `${base.replace(/\/$/, '')}/verify?batch=${encodeURIComponent(id)}`;

    const format = (req.query.format || 'png').toLowerCase();
    const size = Math.min(Math.max(parseInt(req.query.size, 10) || 320, 128), 1024);

    if (format === 'svg') {
      const svg = await QRCode.toString(target, {
        type: 'svg',
        margin: 2,
        width: size,
        color: { dark: '#0b0b0b', light: '#f5b942' }
      });
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(svg);
    }

    const png = await QRCode.toBuffer(target, {
      type: 'png',
      margin: 2,
      width: size,
      color: { dark: '#0b0b0b', light: '#f5b942' }
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(png);
  } catch (e) { next(e); }
});

/* ---------- POST /api/batches (protected) ---------- */

router.post('/', requireApiKey, (req, res, next) => {
  try {
    const {
      id, hiveId, beekeeperId, harvestDate, location,
      healthAtHarvest, healthLabel, weightKg, moisturePct,
      onchainHash, blockNumber, ipfsCid
    } = req.body || {};

    if (!id || !hiveId || !beekeeperId || !harvestDate || !location || !onchainHash) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: id, hiveId, beekeeperId, harvestDate, location, onchainHash'
      });
    }

    db.prepare(`
      INSERT INTO batches
        (id, hive_id, beekeeper_id, harvest_date, location, health_at_harvest, health_label,
         weight_kg, moisture_pct, onchain_hash, block_number, ipfs_cid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalizeId(id), hiveId, beekeeperId, harvestDate, location,
      healthAtHarvest ?? null, healthLabel ?? 'Unknown',
      weightKg ?? null, moisturePct ?? null,
      onchainHash, blockNumber ?? null, ipfsCid ?? null
    );

    const row = db.prepare(`
      SELECT b.*, k.name AS beekeeper_name
      FROM batches b JOIN beekeepers k ON k.id = b.beekeeper_id
      WHERE b.id = ?
    `).get(normalizeId(id));

    res.status(201).json({ success: true, data: buildBatchResponse(row) });
  } catch (e) { next(e); }
});

export default router;