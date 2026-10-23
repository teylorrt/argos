import { randomUUID } from 'node:crypto';
import { encrypt } from './crypto.js';
import { apps, sources, type Observation } from './model.js';
const base = process.env.SERVER_URL ?? 'http://127.0.0.1:3000';
const ownerToken = process.env.OWNER_TOKEN;
if (!ownerToken) throw new Error('OWNER_TOKEN required');
async function api(path: string, body: unknown, token?: string) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json() as Promise<any>;
}
const enrollment = await api('/v1/enrollments', {}, ownerToken);
const device = await api('/v1/devices/register', { code: enrollment.code, installationId: randomUUID(), label: 'Simulador de integração' });
const items = [];
for (const app of apps) for (const source of sources) for (const direction of ['incoming', 'outgoing'] as const) {
  const event: Observation = {
    schemaVersion: 1, eventId: randomUUID(), deviceId: device.deviceId, app,
    packageName: { whatsapp: 'com.whatsapp', instagram: 'com.instagram.android', messenger: 'com.facebook.orca' }[app],
    source, simulated: true, direction, deliveryState: 'observed',
    text: `Mensagem de teste no ${app}: Olá! Ação, café e emoji 📨\nFonte: ${source}.`,
    conversation: { id: null, title: 'Conversa de demonstração', isGroup: false },
    sender: direction === 'outgoing' ? 'Eu (simulação)' : 'Contato de teste',
    recipient: direction === 'outgoing' ? 'Contato de teste' : 'Eu (simulação)',
    observedAt: new Date().toISOString(), messageAt: new Date().toISOString(), displayedTime: null,
    appVersion: 'simulated', adapterVersion: 'simulator/1', confidence: 'structured',
    evidence: ['synthetic_fixture'], relatedEventId: null,
  };
  items.push({ eventId: event.eventId, envelope: await encrypt(event, device.recipientKey) });
}
const response = await api('/v1/observations/batch', { items }, device.token);
console.log(JSON.stringify({ simulated: true, count: items.length, results: response.items.map((i: any) => i.status) }));
await api('/v1/devices/me/revoke', {}, device.token);
