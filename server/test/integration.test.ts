import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { encrypt, KeyRing } from '../src/crypto.js';
import { type Observation } from '../src/model.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Use TEST_DATABASE_URL with a dedicated database ending in _test');
const db = new Database(url);
const ownerToken = 'integration-owner-token-with-more-than-32-characters';
const owner = { authorization: `Bearer ${ownerToken}` };
let directory: string, keys: KeyRing, app: Awaited<ReturnType<typeof buildApp>>, address: string;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'argos-keys-'));
  keys = await KeyRing.open(directory);
  await db.migrate();
  await db.pool.query('TRUNCATE observations,devices,enrollments,audit_events RESTART IDENTITY CASCADE');
  app = await buildApp({ database: db, keys, ownerToken });
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.headers['x-test-drop-after-commit'] === 'yes') reply.raw.destroy();
    return payload;
  });
  address = await app.listen({ host: '127.0.0.1', port: 0 });
});
after(async () => { await app?.close(); await db.pool.end(); if (directory) await rm(directory, { recursive: true, force: true }); });
async function register(label = 'Test phone') {
  const pair = await app.inject({ method: 'POST', url: '/v1/enrollments', headers: owner, payload: {} });
  const code = pair.json().code as string;
  const installationId = randomUUID();
  const response = await app.inject({ method: 'POST', url: '/v1/devices/register', payload: { code, installationId, label } });
  assert.equal(response.statusCode, 200);
  const result = response.json();
  return { ...result, code, installationId, headers: { authorization: `Bearer ${result.token}` } };
}
function observation(deviceId: string, extra: Partial<Observation> = {}): Observation {
  return { schemaVersion: 1, eventId: randomUUID(), deviceId, app: 'whatsapp', packageName: 'com.whatsapp', source: 'accessibility', simulated: true,
    direction: 'outgoing', deliveryState: 'observed', text: 'Ação, café e emoji 📨\n' + 'Texto longo. '.repeat(500),
    conversation: { id: null, title: 'Contato sintético', isGroup: false }, sender: 'Eu', recipient: 'Contato sintético', observedAt: new Date().toISOString(),
    messageAt: null, displayedTime: '12:30', appVersion: 'test', adapterVersion: 'test/1', confidence: 'heuristic', evidence: ['synthetic_fixture'], relatedEventId: null, ...extra };
}
async function item(event: Observation) { return { eventId: event.eventId, envelope: await encrypt(event, keys.publicKey()) }; }

test('authentication scopes, pairing expiration and transactional one-time consumption', async () => {
  assert.equal((await app.inject({ url: '/v1/observations' })).statusCode, 401);
  const d = await register();
  assert.equal((await app.inject({ url: '/v1/observations', headers: d.headers })).statusCode, 401);
  assert.equal((await app.inject({ url: '/v1/devices/me', headers: owner })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/devices/register', payload: { code: d.code, installationId: d.installationId, label: 'again' } })).statusCode, 409);
  const pair = (await app.inject({ method: 'POST', url: '/v1/enrollments', headers: owner, payload: {} })).json();
  const responses = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/v1/devices/register', payload: { code: pair.code, installationId: randomUUID(), label: 'concurrent' } })));
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
  const expired = (await app.inject({ method: 'POST', url: '/v1/enrollments', headers: owner, payload: {} })).json();
  await db.pool.query("UPDATE enrollments SET expires_at=now()-interval '1 second' WHERE consumed_at IS NULL");
  assert.equal((await app.inject({ method: 'POST', url: '/v1/devices/register', payload: { code: expired.code, installationId: randomUUID(), label: 'expired' } })).statusCode, 409);
});

test('JWE persistence, duplicate acknowledgement, conflict, partial acceptance and filters', async () => {
  const d = await register(); const event = observation(d.deviceId); const original = await item(event);
  const send = (items: unknown[]) => app.inject({ method: 'POST', url: '/v1/observations/batch', headers: d.headers, payload: { items } });
  assert.equal((await send([original])).json().items[0].status, 'accepted');
  assert.equal((await send([original])).json().items[0].status, 'already_received');
  const conflict = await item({ ...event, text: 'different' });
  assert.equal((await send([conflict])).json().items[0].code, 'EVENT_CONFLICT');
  const row = (await db.pool.query('SELECT envelope FROM observations WHERE event_id=$1', [event.eventId])).rows[0];
  assert.equal(row.envelope, original.envelope); assert.ok(!row.envelope.includes('Contato sintético'));
  const wrong = await item(observation(randomUUID()));
  const good = await item(observation(d.deviceId, { app: 'instagram', source: 'notification' }));
  const response = await send([wrong, good]);
  assert.deepEqual(response.json().items.map((i: any) => i.status), ['rejected_permanent', 'accepted']);
  const list = (await app.inject({ url: `/v1/observations?deviceId=${d.deviceId}&app=instagram&source=notification&simulated=true`, headers: owner })).json();
  assert.equal(list.items.length, 1); assert.equal(list.items[0].source, 'notification');
  const firstPage = (await app.inject({ url: `/v1/observations?deviceId=${d.deviceId}&limit=1`, headers: owner })).json();
  assert.ok(firstPage.nextCursor);
  const next = (await app.inject({ url: `/v1/observations?deviceId=${d.deviceId}&limit=1&before=${firstPage.nextCursor}`, headers: owner })).json();
  assert.notEqual(firstPage.items[0].eventId, next.items[0].eventId);
  const details = (await app.inject({ url: `/v1/observations/${next.items[0].id}`, headers: owner })).json();
  assert.equal(details.text, event.text);
});

test('tampered header/ciphertext/tag, external identity, disallowed algorithm and oversized batches are rejected', async () => {
  const d = await register(); const original = await item(observation(d.deviceId));
  const parts = original.envelope.split('.');
  const tampered = [];
  for (const index of [0, 3, 4]) { const changed = [...parts]; const value = changed[index]!; changed[index] = (value[0] === 'A' ? 'B' : 'A') + value.slice(1); tampered.push({ ...original, envelope: changed.join('.') }); }
  const changed = [...parts]; changed[0] = Buffer.from(JSON.stringify({ alg: 'RSA1_5', enc: 'A256GCM', kid: keys.publicKey().kid })).toString('base64url'); tampered.push({ ...original, envelope: changed.join('.') });
  tampered.push({ ...original, eventId: randomUUID() });
  const response = await app.inject({ method: 'POST', url: '/v1/observations/batch', headers: d.headers, payload: { items: tampered } });
  assert.ok(response.json().items.every((i: any) => i.status === 'rejected_permanent'));
  assert.equal((await app.inject({ method: 'POST', url: '/v1/observations/batch', headers: d.headers, payload: { items: Array.from({ length: 101 }, () => ({ eventId: randomUUID(), envelope: 'x'.repeat(30) })) } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/observations/batch', headers: d.headers, payload: { items: [{ eventId: randomUUID(), envelope: 'a'.repeat(600000) }] } })).statusCode, 413);
});

test('network response lost after commit: retry stores exactly one row', async () => {
  const d = await register(); const original = await item(observation(d.deviceId));
  await assert.rejects(fetch(address + '/v1/observations/batch', { method: 'POST', headers: { ...d.headers, 'content-type': 'application/json', 'x-test-drop-after-commit': 'yes' }, body: JSON.stringify({ items: [original] }) }));
  const retry = await app.inject({ method: 'POST', url: '/v1/observations/batch', headers: d.headers, payload: { items: [original] } });
  assert.equal(retry.json().items[0].status, 'already_received');
  assert.equal((await db.pool.query('SELECT count(*)::int AS count FROM observations WHERE event_id=$1', [original.eventId])).rows[0].count, 1);
});

test('rotation preserves old envelopes, keyring restart, revocation and secure re-pairing', async () => {
  const d = await register(); const event = observation(d.deviceId); const old = await item(event);
  await keys.rotate(directory);
  assert.deepEqual(await keys.decrypt(old.envelope), event);
  assert.deepEqual(await (await KeyRing.open(directory)).decrypt(old.envelope), event);
  const accepted = await app.inject({ method: 'POST', url: '/v1/observations/batch', headers: d.headers, payload: { items: [old] } });
  assert.equal(accepted.json().items[0].status, 'accepted');
  await app.inject({ method: 'POST', url: `/v1/devices/${d.deviceId}/revoke`, headers: owner, payload: {} });
  assert.equal((await app.inject({ method: 'POST', url: '/v1/observations/batch', headers: d.headers, payload: { items: [old] } })).statusCode, 401);
  const pair = (await app.inject({ method: 'POST', url: '/v1/enrollments', headers: owner, payload: {} })).json();
  const recovered = (await app.inject({ method: 'POST', url: '/v1/devices/register', payload: { code: pair.code, installationId: d.installationId, label: 'recovered' } })).json();
  assert.equal(recovered.deviceId, d.deviceId); assert.notEqual(recovered.token, d.token);
  assert.equal((await app.inject({ url: '/v1/devices/me', headers: d.headers })).statusCode, 401);
});

test('browser session cookie, CSRF, safe static content and deletion', async () => {
  const login = await app.inject({ method: 'POST', url: '/v1/session', payload: { token: ownerToken } });
  const session = login.cookies.find(c => c.name === 'argos_session')!;
  assert.ok(session.httpOnly); assert.equal(session.sameSite, 'Strict');
  const cookies = { argos_session: session.value };
  assert.equal((await app.inject({ url: '/v1/observations', cookies })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/enrollments', cookies, payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/enrollments', cookies, headers: { 'x-csrf-token': login.json().csrf }, payload: {} })).statusCode, 200);
  const staticPage = await app.inject({ url: '/' }); assert.equal(staticPage.statusCode, 200); assert.ok(staticPage.headers['content-security-policy']);
  const row = (await db.pool.query('SELECT id FROM observations LIMIT 1')).rows[0];
  assert.equal((await app.inject({ method: 'DELETE', url: `/v1/observations/${row.id}`, headers: owner })).statusCode, 200);
  assert.equal((await app.inject({ url: `/v1/observations/${row.id}`, headers: owner })).statusCode, 404);
});

test('contract examples validate and retention removes only expired received records', async () => {
  const { observationSchema } = await import('../src/model.js');
  const examples = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../contracts/examples.json', import.meta.url), 'utf8'));
  assert.ok(observationSchema.safeParse(examples.accessibility).success);
  assert.ok(observationSchema.safeParse(examples.notification).success);
  assert.ok(!observationSchema.safeParse({ ...examples.notification, observedAt: 'not-a-date' }).success);
  const d = await register(); const old = await item(observation(d.deviceId)); const fresh = await item(observation(d.deviceId));
  await app.inject({ method: 'POST', url: '/v1/observations/batch', headers: d.headers, payload: { items: [old, fresh] } });
  await db.pool.query("UPDATE observations SET received_at=now()-interval '100 days' WHERE event_id=$1", [old.eventId]);
  assert.equal(await db.retention(90), 1);
  assert.equal((await db.pool.query('SELECT count(*)::int AS count FROM observations WHERE event_id=$1', [fresh.eventId])).rows[0].count, 1);
});
