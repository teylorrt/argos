import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compactDecrypt, CompactEncrypt, decodeProtectedHeader, exportJWK, generateKeyPair, importJWK, type JWK } from 'jose';
import { ApiError, observationSchema, type Observation } from './model.js';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export const matches = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
type StoredKey = { kid: string; publicJwk: JWK; privateJwk: JWK };

export class KeyRing {
  private constructor(private keys: StoredKey[], private activeKid: string) {}
  static async open(directory: string) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const names = (await readdir(directory)).filter(n => n.endsWith('.key.json'));
    const keys = await Promise.all(names.map(async name => JSON.parse(await readFile(join(directory, name), 'utf8')) as StoredKey));
    let activeKid: string;
    if (keys.length === 0) {
      const key = await KeyRing.generate();
      await writeFile(join(directory, `${key.kid}.key.json`), JSON.stringify(key), { mode: 0o600, flag: 'wx' });
      await writeFile(join(directory, 'active'), key.kid, { mode: 0o600 });
      keys.push(key); activeKid = key.kid;
    } else { activeKid = (await readFile(join(directory, 'active'), 'utf8')).trim(); }
    if (!keys.some(k => k.kid === activeKid)) throw new Error('ACTIVE_KEY_MISSING');
    return new KeyRing(keys, activeKid);
  }
  private static async generate(): Promise<StoredKey> {
    const pair = await generateKeyPair('RSA-OAEP-256', { modulusLength: 3072, extractable: true });
    const kid = `argos-${randomBytes(12).toString('hex')}`;
    return { kid, publicJwk: { ...await exportJWK(pair.publicKey), kid, alg: 'RSA-OAEP-256', use: 'enc' }, privateJwk: await exportJWK(pair.privateKey) };
  }
  async rotate(directory: string) {
    const key = await KeyRing.generate();
    await writeFile(join(directory, `${key.kid}.key.json`), JSON.stringify(key), { mode: 0o600, flag: 'wx' });
    await writeFile(join(directory, 'active'), key.kid, { mode: 0o600 });
    this.keys.push(key); this.activeKid = key.kid;
    return this.publicKey();
  }
  publicKey() { return this.keys.find(k => k.kid === this.activeKid)!.publicJwk; }
  async decrypt(envelope: string): Promise<Observation> {
    const header = decodeProtectedHeader(envelope);
    if (header.alg !== 'RSA-OAEP-256' || header.enc !== 'A256GCM' || typeof header.kid !== 'string') throw new ApiError(400, 'INVALID_ENVELOPE');
    const stored = this.keys.find(k => k.kid === header.kid);
    if (!stored) throw new ApiError(400, 'UNKNOWN_KEY');
    const key = await importJWK(stored.privateJwk, 'RSA-OAEP-256');
    const { plaintext } = await compactDecrypt(envelope, key, { keyManagementAlgorithms: ['RSA-OAEP-256'], contentEncryptionAlgorithms: ['A256GCM'] });
    return observationSchema.parse(JSON.parse(new TextDecoder().decode(plaintext)));
  }
}
export async function encrypt(observation: Observation, jwk: JWK) {
  const key = await importJWK(jwk, 'RSA-OAEP-256');
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(observation)))
    .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: jwk.kid }).encrypt(key);
}
