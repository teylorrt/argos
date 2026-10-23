import { Database } from './db.js';
import { KeyRing } from './crypto.js';
import { buildApp } from './app.js';

const databaseUrl = process.env.DATABASE_URL;
const ownerToken = process.env.OWNER_TOKEN;
if (!databaseUrl || !ownerToken) throw new Error('DATABASE_URL and OWNER_TOKEN are required');
const retentionDays = Number(process.env.RETENTION_DAYS ?? 90);
if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 36500) throw new Error('Invalid RETENTION_DAYS');
const database = new Database(databaseUrl);
await database.migrate();
const keys = await KeyRing.open(process.env.KEY_DIR ?? './data/keys');
const app = await buildApp({ database, keys, ownerToken, cookieSecure: process.env.COOKIE_SECURE === 'true', logging: true });
await database.retention(retentionDays);
const timer = setInterval(() => database.retention(retentionDays).catch(() => app.log.error({ code: 'RETENTION_FAILED' })), 3600000);
timer.unref();
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3000) });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { clearInterval(timer); await app.close(); await database.pool.end(); process.exit(0); });
