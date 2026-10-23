import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { KeyRing } from './crypto.js';
import { observationSchema } from './model.js';
const directory = resolve(process.env.ARGOS_INTEROP_DIR ?? '../.tools/interop');
await mkdir(directory, { recursive: true });
const keys = await KeyRing.open(join(directory, 'keys'));
if (process.argv.includes('--verify')) {
  const envelope = await readFile(join(directory, 'android.jwe'), 'utf8');
  const decoded = await keys.decrypt(envelope);
  const expected = JSON.parse(await readFile(join(directory, 'payload.json'), 'utf8'));
  if (JSON.stringify(decoded) !== JSON.stringify(expected)) throw new Error('INTEROP_PAYLOAD_MISMATCH');
  for (const index of [0, 3, 4]) {
    const parts = envelope.split('.'); const value = parts[index]!;
    parts[index] = (value[0] === 'A' ? 'B' : 'A') + value.slice(1);
    let rejected = false; try { await keys.decrypt(parts.join('.')); } catch { rejected = true; }
    if (!rejected) throw new Error('TAMPER_NOT_REJECTED');
  }
  console.log('Kotlin/Nimbus → Node/jose: payload intact; modified header, ciphertext and tag rejected.');
} else {
  const event = observationSchema.parse({ schemaVersion: 1, eventId: randomUUID(), deviceId: randomUUID(), app: 'whatsapp', packageName: 'com.whatsapp', source: 'accessibility', simulated: true, direction: 'outgoing', deliveryState: 'observed', text: 'Ação, café e emoji 📨\n' + 'Texto longo. '.repeat(1000), conversation: { id: null, title: 'Teste sintético', isGroup: false }, sender: 'Eu', recipient: 'Teste', observedAt: new Date().toISOString(), messageAt: null, displayedTime: null, appVersion: 'test', adapterVersion: 'test/1', confidence: 'structured', evidence: ['synthetic_fixture'], relatedEventId: null });
  await writeFile(join(directory, 'payload.json'), JSON.stringify(event));
  await writeFile(join(directory, 'public.json'), JSON.stringify(keys.publicKey()));
  console.log('Interop fixture prepared. Set ARGOS_INTEROP_DIR when running Android JVM tests.');
}
