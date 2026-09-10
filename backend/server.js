import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { initSchema } from './db/database.js';
import batchesRouter from './routes/batches.js';
import hivesRouter from './routes/hives.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// --- CORS ---
const allowed = (process.env.CORS_ORIGINS || '*')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  }
}));

// --- Body parsing ---
app.use(express.json({ limit: '256kb' }));

// --- Rate limiting ---
app.use('/api/', rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));

// --- Health ---
app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', service: 'honeychain-api', time: new Date().toISOString() });
});

// --- Routes ---
app.use('/api/batches', batchesRouter);
app.use('/api/hives', hivesRouter);

// --- QR deep link (human-readable; served as HTML redirect) ---
app.get('/verify', (req, res) => {
  const batch = String(req.query.batch || '').trim();
  // In production, replace with an actual redirect to your SPA:
  // res.redirect(`https://honeychain.app/?batch=${encodeURIComponent(batch)}`);
  res.type('html').send(`
    <!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>HoneyChain · Batch ${batch || ''}</title>
    <style>
      body{font-family:system-ui,sans-serif;background:#0b0b0b;color:#f2f2f2;
           display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
      .card{background:#161616;border:1px solid #2a2a2a;border-radius:16px;
            padding:40px;text-align:center;max-width:420px}
      h1{color:#f5b942;margin:0 0 8px;font-size:1.4rem}
      p{color:#b8b8b8;line-height:1.6;margin:8px 0}
      code{color:#f5b942;background:#0b0b0b;padding:6px 12px;border-radius:6px;
           display:inline-block;margin-top:12px;font-size:1.05rem}
    </style></head>
    <body><div class="card">
      <h1>✦ HoneyChain</h1>
      <p>Batch scanned successfully.</p>
      ${batch ? `<code>${batch.replace(/[<>&"]/g, '')}</code>` : '<p>No batch ID supplied.</p>'}
      <p style="font-size:.85rem;color:#909090;margin-top:20px">
        Open the HoneyChain app and enter this batch ID to see the full record.
      </p>
    </div></body></html>
  `);
});

// --- Errors ---
app.use(notFound);
app.use(errorHandler);

// --- Boot ---
initSchema();
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🍯 HoneyChain API running at http://localhost:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/health`);
  console.log(`   Example: http://localhost:${PORT}/api/batches/HC-2026-0842`);
});