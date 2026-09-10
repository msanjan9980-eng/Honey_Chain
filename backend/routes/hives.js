import { Router } from 'express';
import { db } from '../db/database.js';

const router = Router();

/* GET /api/hives/:id */
router.get('/:id', (req, res, next) => {
  try {
    const hive = db.prepare(`
      SELECT h.*, k.name AS beekeeper_name, k.location AS beekeeper_location
      FROM hives h JOIN beekeepers k ON k.id = h.beekeeper_id
      WHERE h.id = ?
    `).get(req.params.id);

    if (!hive) return res.status(404).json({ success: false, error: 'Hive not found' });
    res.json({ success: true, data: hive });
  } catch (e) { next(e); }
});

/* GET /api/hives/:id/readings?days=7 */
router.get('/:id/readings', (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 90);
    const rows = db.prepare(`
      SELECT recorded_at, temperature_c, humidity_pct, weight_kg, audio_health_score
      FROM sensor_readings
      WHERE hive_id = ?
      ORDER BY recorded_at DESC
      LIMIT ?
    `).all(req.params.id, days);

    res.json({
      success: true,
      hiveId: req.params.id,
      days,
      data: rows.reverse()
    });
  } catch (e) { next(e); }
});

export default router;