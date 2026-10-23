import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';

test('panel renders plain text, participants and simulated/source labels; search and app filters work', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const { document, window } = parseHTML(html);
  const calls: string[] = [];
  const fixture = { id: '1', app: 'whatsapp', source: 'notification', simulated: true, sender: 'Alice', recipient: 'Bob', text: '<img src=x onerror=alert(1)> Olá 📨', conversation: { title: 'Teste' }, direction: 'incoming', deliveryState: 'observed', observedAt: '2026-10-23T12:00:00Z' };
  // linkedom does not implement HTMLSelectElement.value; provide a minimal form value model.
  for (const id of ['app', 'source', 'simulated', 'from', 'to', 'search']) Object.defineProperty(document.getElementById(id), 'value', { value: '', writable: true });
  const fetch = async (path: string) => {
    calls.push(path);
    const data = path === '/v1/session' ? { csrf: 'test-csrf' } : path === '/v1/devices' ? { items: [] } : { items: [fixture], nextCursor: null };
    return { ok: true, status: 200, json: async () => data };
  };
  runInNewContext(script, { document, window, fetch, URLSearchParams, Date, console });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(document.querySelector('.body')?.textContent, fixture.text);
  assert.equal(document.querySelectorAll('#messages img').length, 0);
  assert.match(document.getElementById('messages')!.textContent!, /Alice → Bob/);
  assert.match(document.getElementById('messages')!.textContent!, /SIMULADO/);
  assert.match(document.getElementById('messages')!.textContent!, /Notificação/);
  const search = document.getElementById('search') as any;
  search.value = 'not-found'; search.oninput();
  assert.equal(document.querySelectorAll('.message').length, 0);
  search.value = 'alice'; search.oninput();
  assert.equal(document.querySelectorAll('.message').length, 1);
  const app = document.getElementById('app') as any;
  app.value = 'instagram'; await app.onchange();
  assert.ok(calls.some(path => path.includes('app=instagram')));
});
