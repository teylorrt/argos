import Fastify, { LogController, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import { ApiError, batchSchema, apps, sources } from './model.js';
import { Database, type Device } from './db.js';
import { KeyRing, hash, matches, secret } from './crypto.js';

export interface AppConfig { database: Database; keys: KeyRing; ownerToken: string; cookieSecure?: boolean; logging?: boolean }
const uuid = z.uuid();
const bearer = (r: FastifyRequest) => r.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];

export async function buildApp(config: AppConfig) {
  if (config.ownerToken.length < 32) throw new Error('OWNER_TOKEN must have at least 32 characters');
  const app = Fastify({ bodyLimit: 512 * 1024, logger: config.logging ? {
    level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
    serializers: { req: r => ({ method: r.method, url: r.url?.split('?')[0] }) },
  } : false, logController: new LogController({ disableRequestLogging: true }) });
  await app.register(cookie);
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute' });
  await app.register(staticFiles, { root: fileURLToPath(new URL('../public', import.meta.url)), index: 'index.html' });
  // Only session-token hashes are stored, process-local and short lived.
  const sessions = new Map<string, { expires: number; csrf: string }>();
  const owner = (request: FastifyRequest) => {
    const token = bearer(request);
    if (token && matches(token, config.ownerToken)) return;
    const session = request.cookies.argos_session ? sessions.get(hash(request.cookies.argos_session)) : undefined;
    if (!session || session.expires <= Date.now()) throw new ApiError(401, 'OWNER_UNAUTHORIZED');
    if (!['GET', 'HEAD'].includes(request.method) && request.headers['x-csrf-token'] !== session.csrf) throw new ApiError(403, 'CSRF_REQUIRED');
  };
  const device = async (request: FastifyRequest): Promise<Device> => {
    const token = bearer(request);
    if (!token) throw new ApiError(401, 'DEVICE_UNAUTHORIZED');
    return config.database.authenticate(token);
  };
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    return payload;
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) return reply.code(error.status).send({ error: error.code });
    if (error instanceof ZodError) return reply.code(400).send({ error: 'INVALID_REQUEST' });
    if ((error as { statusCode?: number }).statusCode === 429) return reply.code(429).send({ error: 'RATE_LIMITED' });
    if ((error as { statusCode?: number }).statusCode === 413) return reply.code(413).send({ error: 'BATCH_TOO_LARGE' });
    if ((error as { statusCode?: number }).statusCode === 400) return reply.code(400).send({ error: 'INVALID_REQUEST' });
    app.log.error({ code: 'INTERNAL_ERROR' }, 'request failed');
    return reply.code(500).send({ error: 'INTERNAL_ERROR' });
  });
  app.get('/health', async () => { await config.database.pool.query('SELECT 1'); return { status: 'ok' }; });
  app.post('/v1/session', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { token } = z.object({ token: z.string().max(1000) }).parse(request.body);
    if (!matches(token, config.ownerToken)) throw new ApiError(401, 'OWNER_UNAUTHORIZED');
    const sessionToken = secret(), csrf = secret();
    for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value!);
    sessions.set(hash(sessionToken), { expires: Date.now() + 8 * 3600000, csrf });
    reply.setCookie('argos_session', sessionToken, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure ?? false, path: '/', maxAge: 8 * 3600 });
    return { csrf };
  });
  app.get('/v1/session', async request => {
    owner(request);
    return { csrf: sessions.get(hash(request.cookies.argos_session ?? ''))?.csrf ?? null };
  });
  app.delete('/v1/session', async (request, reply) => {
    owner(request); sessions.delete(hash(request.cookies.argos_session ?? ''));
    reply.clearCookie('argos_session', { path: '/' }); return { ok: true };
  });
  app.post('/v1/enrollments', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async request => { owner(request); return config.database.enrollment(); });
  app.post('/v1/devices/register', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async request => {
    const body = z.object({ code: z.string().min(16).max(200), installationId: uuid, label: z.string().min(1).max(150) }).strict().parse(request.body);
    return { ...await config.database.register(body.code, body.installationId, body.label), recipientKey: config.keys.publicKey() };
  });
  app.get('/v1/devices/me', async request => {
    const d = await device(request);
    return { deviceId: d.id, state: 'registered', credentialExpiresAt: d.credential_expires_at, recipientKey: config.keys.publicKey() };
  });
  app.post('/v1/devices/me/revoke', async request => { const d = await device(request); await config.database.revoke(d.id); return { ok: true }; });
  app.get('/v1/devices', async request => { owner(request); return { items: await config.database.devices() }; });
  app.post('/v1/devices/:id/revoke', async request => { owner(request); await config.database.revoke(uuid.parse((request.params as { id: string }).id)); return { ok: true }; });
  app.get('/v1/crypto/recipient-key', async request => { await device(request); return config.keys.publicKey(); });
  app.post('/v1/observations/batch', async request => {
    const d = await device(request);
    const { items } = batchSchema.parse(request.body);
    const results = [];
    for (const item of items) {
      let event;
      try { event = await config.keys.decrypt(item.envelope); }
      catch (e) {
        results.push({ eventId: item.eventId, status: e instanceof ApiError && e.code === 'UNKNOWN_KEY' ? 'retryable' : 'rejected_permanent', code: e instanceof ApiError && e.code === 'UNKNOWN_KEY' ? 'UNKNOWN_KEY' : 'INVALID_ENVELOPE' });
        continue;
      }
      if (event.deviceId !== d.id || event.eventId !== item.eventId) { results.push({ eventId: item.eventId, status: 'rejected_permanent', code: 'IDENTITY_MISMATCH' }); continue; }
      try {
        // Lock against revocation until this individual commit; no accepted response before COMMIT.
        const client = await config.database.pool.connect();
        try {
          await client.query('BEGIN');
          const valid = await client.query('SELECT id FROM devices WHERE id=$1 AND revoked_at IS NULL AND credential_expires_at>now() FOR SHARE', [d.id]);
          if (!valid.rowCount) throw new ApiError(401, 'DEVICE_UNAUTHORIZED');
          // Use the same connection for both identity check and insert transaction.
          const digest = hash(item.envelope);
          const r = await client.query(`INSERT INTO observations(device_id,event_id,envelope,envelope_hash,schema_version,app,source,simulated,observed_at)
            VALUES($1,$2,$3,$4,1,$5,$6,$7,$8) ON CONFLICT(device_id,event_id) DO NOTHING RETURNING id`, [d.id, event.eventId, item.envelope, digest, event.app, event.source, event.simulated, event.observedAt]);
          let status: string = 'accepted'; let code: string | undefined;
          if (!r.rowCount) {
            const original = await client.query('SELECT envelope_hash FROM observations WHERE device_id=$1 AND event_id=$2', [d.id, item.eventId]);
            status = original.rows[0]?.envelope_hash === digest ? 'already_received' : 'rejected_permanent';
            if (status === 'rejected_permanent') code = 'EVENT_CONFLICT';
          }
          await client.query('COMMIT'); results.push({ eventId: item.eventId, status, ...(code ? { code } : {}) });
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      } catch (e) { if (e instanceof ApiError) throw e; results.push({ eventId: item.eventId, status: 'retryable', code: 'STORAGE_UNAVAILABLE' }); }
    }
    return { items: results };
  });
  const filters = z.object({
    app: z.enum(apps).optional(), source: z.enum(sources).optional(),
    simulated: z.enum(['true', 'false']).optional(), deviceId: uuid.optional(),
    before: z.string().regex(/^\d{1,19}$/).optional(), limit: z.coerce.number().int().min(1).max(100).default(50),
    from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
  }).strict();
  app.get('/v1/observations', async request => {
    owner(request); const query = filters.parse(request.query);
    const conditions: string[] = []; const values: unknown[] = [];
    const condition = (sql: string, value: unknown) => { values.push(value); conditions.push(sql.replace('?', `$${values.length}`)); };
    if (query.app) condition('app=?', query.app);
    if (query.source) condition('source=?', query.source);
    if (query.simulated) condition('simulated=?', query.simulated === 'true');
    if (query.deviceId) condition('device_id=?', query.deviceId);
    if (query.before) condition('id<?', query.before);
    if (query.from) condition('observed_at>=?', query.from);
    if (query.to) condition('observed_at<=?', query.to);
    values.push(query.limit + 1);
    const r = await config.database.pool.query(`SELECT id,device_id,event_id,envelope,received_at FROM observations ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY id DESC LIMIT $${values.length}`, values);
    const hasMore = r.rows.length > query.limit;
    const rows = r.rows.slice(0, query.limit);
    const items = await Promise.all(rows.map(async row => {
      try { return { id: String(row.id), receivedAt: row.received_at, ...await config.keys.decrypt(row.envelope) }; }
      catch { return { id: String(row.id), eventId: row.event_id, deviceId: row.device_id, error: 'KEY_OR_DATA_UNAVAILABLE' }; }
    }));
    return { items, nextCursor: hasMore ? String(rows.at(-1)!.id) : null };
  });
  app.get('/v1/observations/:id', async request => {
    owner(request); const id = z.string().regex(/^\d{1,19}$/).parse((request.params as { id: string }).id);
    const r = await config.database.pool.query('SELECT id,envelope,received_at FROM observations WHERE id=$1', [id]);
    if (!r.rows[0]) throw new ApiError(404, 'NOT_FOUND');
    await config.database.audit('observation_read', id);
    return { id, receivedAt: r.rows[0].received_at, ...await config.keys.decrypt(r.rows[0].envelope) };
  });
  app.delete('/v1/observations/:id', async request => {
    owner(request); const id = z.string().regex(/^\d{1,19}$/).parse((request.params as { id: string }).id);
    const result = await config.database.pool.query('DELETE FROM observations WHERE id=$1', [id]);
    if (!result.rowCount) throw new ApiError(404, 'NOT_FOUND');
    await config.database.audit('observation_deleted', id); return { ok: true };
  });
  return app;
}
