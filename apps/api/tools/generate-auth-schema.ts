import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { startDatabase } from '../test/database.js';
import { createAuth } from '../src/auth.js';
import { readConfig } from '../src/config.js';

const db = await startDatabase();
const pool = new Pool({ connectionString: db.adminUrl });
try {
  const config = readConfig({ DATABASE_URL: db.adminUrl, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'https://fespay.test' });
  const auth = createAuth(config, pool);
  const migrations = await getMigrations(auth.options);
  const sql = await migrations.compileMigrations();
  await mkdir(new URL('../../../database/migrations/', import.meta.url), { recursive: true });
  await writeFile(new URL('../../../database/migrations/0002-auth.sql', import.meta.url), '-- Generated from Better Auth 1.7.7 and apps/api/src/auth.ts.\n'+sql+'\n');
  console.log('Generated Better Auth SQL from the fixed configuration in an isolated DB.');
} finally { await pool.end(); await db.stop(); }
