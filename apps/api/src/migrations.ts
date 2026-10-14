import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export function guardDevelopmentDatabase(connectionString: string, development: boolean) {
  const url = new URL(connectionString);
  if (!development || process.env.NODE_ENV === 'production' || !['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.search || url.hash || !/^\/fespay_(dev|test_[a-z0-9_]+)$/.test(url.pathname)) {
    throw new Error('Development migrations require explicit development mode and a loopback fespay_dev/fespay_test_* database');
  }
}

type Migration = { id: string; file: string; sha256: string };
export async function applyDevelopmentMigrations(connectionString: string, appPassword: string, development: boolean, statusOnly = false) {
  guardDevelopmentDatabase(connectionString, development);
  if (!statusOnly && !/^[a-f0-9]{64}$/.test(appPassword)) throw new Error('Use a generated 32-byte hexadecimal FESPAY_APP_PASSWORD');
  const migrations: Migration[] = JSON.parse(await readFile(resolve(root, 'database/migrations/manifest.json'), 'utf8'));
  const sources = await Promise.all(migrations.map(async migration => {
    const sql = await readFile(resolve(root, migration.file), 'utf8');
    const digest = createHash('sha256').update(sql).digest('hex');
    if (digest !== migration.sha256) throw new Error(`Source checksum mismatch: ${migration.id}`);
    // The design source owns an outer transaction; our runner owns this one.
    const body = sql.includes('\nBEGIN;\n') && sql.endsWith('COMMIT;\n')
      ? sql.replace('\nBEGIN;\n', '\n').slice(0, -'COMMIT;\n'.length) : sql;
    return { ...migration, body };
  }));
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock(18361013)');
    if (!statusOnly) {
      await client.query('CREATE SCHEMA IF NOT EXISTS fespay_meta');
      await client.query('CREATE TABLE IF NOT EXISTS fespay_meta.migrations (id text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    }
    const present = await client.query("SELECT to_regclass('fespay_meta.migrations') AS relation");
    const result = present.rows[0].relation
      ? await client.query<{ id: string; sha256: string }>('SELECT id,sha256 FROM fespay_meta.migrations ORDER BY id')
      : { rows: [] };
    const existing = new Map(result.rows.map(row => [row.id, row.sha256]));
    if (new Set(sources.map(row => row.id)).size !== sources.length) throw new Error('Duplicate migration ID');
    for (const id of existing.keys()) {
      if (!sources.some(row => row.id === id)) throw new Error('Applied migration is missing from the manifest');
    }
    for (const migration of sources) {
      const recorded = existing.get(migration.id);
      if (recorded && recorded !== migration.sha256) throw new Error(`Applied migration checksum mismatch: ${migration.id}`);
      if (recorded || statusOnly) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.body);
        await client.query('INSERT INTO fespay_meta.migrations(id,sha256) VALUES($1,$2)', [migration.id, migration.sha256]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
    if (!statusOnly) {
      // appPassword is validated as hex, never interpolated from arbitrary SQL.
      await client.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='fespay_app') THEN CREATE ROLE fespay_app LOGIN; END IF; END $$; ALTER ROLE fespay_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${appPassword}';`);
      await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE ALL ON SCHEMA fespay_meta FROM PUBLIC; GRANT USAGE ON SCHEMA public,auth TO fespay_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,auth TO fespay_app;');
    }
    return sources.map(migration => ({ id: migration.id, status: existing.has(migration.id) || !statusOnly ? 'applied' : 'pending' }));
  } finally {
    if (client) {
      await client.query('SELECT pg_advisory_unlock(18361013)').catch(() => {});
      client.release();
    }
    await pool.end();
  }
}
