import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { Pool } from 'pg';

const exec = promisify(execFile);
export const POSTGRES_IMAGE = 'postgres@sha256:0780ef0827baebe99b75a7feb7d97110d6ec1e4df3e5c4ec5b9a5143ef90ac3a';
export async function startDatabase() {
  const name = `fespay-foundation-${randomUUID()}`;
  const password = randomBytes(32).toString('hex');
  const appPassword = randomBytes(32).toString('hex');
  const stop = async () => { await exec('docker', ['rm', '--force', name]).catch(() => {}); };
  try {
    await exec('docker', ['run', '--detach', '--pull', 'never', '--name', name,
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data',
      '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=fespay_owner', '-e', 'POSTGRES_DB=fespay_test_foundation', POSTGRES_IMAGE],
      { env: { ...process.env, POSTGRES_PASSWORD: password } });
    const { stdout } = await exec('docker', ['port', name, '5432/tcp']);
    const port = stdout.trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    if (!port) throw new Error('Expected loopback Docker port');
    const adminUrl = `postgresql://fespay_owner:${password}@127.0.0.1:${port}/fespay_test_foundation`;
    const appUrl = `postgresql://fespay_app:${appPassword}@127.0.0.1:${port}/fespay_test_foundation`;
    const pool = new Pool({ connectionString: adminUrl, connectionTimeoutMillis: 1000 });
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try { await pool.query('SELECT 1'); ready = true; break; } catch { await setTimeout(100); }
      }
      if (!ready) throw new Error('Isolated PostgreSQL not ready');
    } finally { await pool.end(); }
    return { adminUrl, appUrl, appPassword, stop };
  } catch (error) { await stop(); throw error; }
}
