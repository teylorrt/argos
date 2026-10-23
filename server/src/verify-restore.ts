import { Database } from './db.js';
import { KeyRing } from './crypto.js';
const db = new Database(process.env.DATABASE_URL!);
try {
  const keys = await KeyRing.open(process.env.KEY_DIR ?? './data/keys');
  const result = await db.pool.query('SELECT event_id,device_id,envelope FROM observations ORDER BY id LIMIT 100');
  for (const row of result.rows) {
    const event = await keys.decrypt(row.envelope);
    if (event.eventId !== row.event_id || event.deviceId !== row.device_id) throw new Error('RESTORE_CONTEXT_MISMATCH');
  }
  console.log(JSON.stringify({ restore: 'ok', decryptedSamples: result.rows.length }));
} finally { await db.pool.end(); }
