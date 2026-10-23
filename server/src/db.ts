import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ApiError } from './model.js';
import { hash, secret } from './crypto.js';
export type Device = { id: string; installation_id: string; label: string; created_at: Date; last_seen_at: Date | null; revoked_at: Date | null; credential_expires_at: Date };
export class Database {
  pool: pg.Pool;
  constructor(url: string) { this.pool = new pg.Pool({ connectionString: url, max: 10 }); }
  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(7801337)');
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const directory = new URL('../migrations/', import.meta.url);
      for (const name of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
        if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
        await client.query(await readFile(new URL(name, directory), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  async enrollment() {
    const code = secret(); const id = randomUUID();
    const result = await this.pool.query('INSERT INTO enrollments(id,code_hash,expires_at) VALUES($1,$2,now()+interval \'15 minutes\') RETURNING expires_at', [id, hash(code)]);
    await this.audit('enrollment_created', id);
    return { code, expiresAt: result.rows[0].expires_at };
  }
  async register(code: string, installationId: string, label: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const enrollment = await client.query('SELECT * FROM enrollments WHERE code_hash=$1 FOR UPDATE', [hash(code)]);
      const row = enrollment.rows[0];
      if (!row || row.consumed_at || new Date(row.expires_at) <= new Date()) throw new ApiError(409, 'PAIRING_EXPIRED_OR_USED');
      const token = secret(); const id = randomUUID();
      // Fresh pairing is the proof required to reissue a credential after a lost response.
      const device = await client.query(`INSERT INTO devices(id,installation_id,label,token_hash,credential_expires_at)
        VALUES($1,$2,$3,$4,now()+interval '365 days')
        ON CONFLICT(installation_id) DO UPDATE SET label=EXCLUDED.label,token_hash=EXCLUDED.token_hash,
        credential_expires_at=EXCLUDED.credential_expires_at,revoked_at=NULL RETURNING id,credential_expires_at`, [id, installationId, label, hash(token)]);
      await client.query('UPDATE enrollments SET consumed_at=now(),installation_id=$1 WHERE id=$2', [installationId, row.id]);
      await client.query('INSERT INTO audit_events(action,subject_id) VALUES($1,$2)', ['device_registered', device.rows[0].id]);
      await client.query('COMMIT');
      return { deviceId: device.rows[0].id as string, token, credentialExpiresAt: device.rows[0].credential_expires_at };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  async authenticate(token: string): Promise<Device> {
    const result = await this.pool.query('UPDATE devices SET last_seen_at=now() WHERE token_hash=$1 AND revoked_at IS NULL AND credential_expires_at>now() RETURNING id,installation_id,label,created_at,last_seen_at,revoked_at,credential_expires_at', [hash(token)]);
    if (!result.rows[0]) throw new ApiError(401, 'DEVICE_UNAUTHORIZED');
    return result.rows[0];
  }
  async devices(): Promise<Device[]> {
    return (await this.pool.query('SELECT id,installation_id,label,created_at,last_seen_at,revoked_at,credential_expires_at FROM devices ORDER BY created_at DESC')).rows;
  }
  async revoke(id: string) {
    const r = await this.pool.query('UPDATE devices SET revoked_at=now() WHERE id=$1 RETURNING id', [id]);
    if (!r.rowCount) throw new ApiError(404, 'NOT_FOUND');
    await this.audit('device_revoked', id);
  }
  async audit(action: string, subjectId?: string) { await this.pool.query('INSERT INTO audit_events(action,subject_id) VALUES($1,$2)', [action, subjectId ?? null]); }
  async retention(days: number) {
    const r = await this.pool.query("DELETE FROM observations WHERE received_at < now() - ($1 * interval '1 day')", [days]);
    await this.pool.query("DELETE FROM enrollments WHERE expires_at < now() - interval '1 day'");
    await this.pool.query("DELETE FROM audit_events WHERE created_at < now() - interval '365 days'");
    return r.rowCount;
  }
}
