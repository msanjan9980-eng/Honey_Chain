// Simple API-key middleware for write operations.
// Read operations are public so anyone scanning a QR can verify a batch.
export function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}