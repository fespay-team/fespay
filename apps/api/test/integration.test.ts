import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth } from '../src/auth.js';
import { readConfig } from '../src/config.js';
import { applyDevelopmentMigrations } from '../src/migrations.js';
import { startDatabase } from './database.js';

test('isolated PostgreSQL migrations and fixed Better Auth adapter', { timeout: 120000 }, async t => {
  const db = await startDatabase();
  const owner = new Pool({ connectionString: db.adminUrl });
  const app = new Pool({ connectionString: db.appUrl });
  const delivered: string[] = [];
  try {
    await t.test('status before first apply is pending without creating schema', async () => {
      const state = await applyDevelopmentMigrations(db.adminUrl, '', true, true);
      assert.deepEqual(state.map(row => row.status), ['pending', 'pending', 'pending']);
      assert.equal((await owner.query("SELECT to_regclass('fespay_meta.migrations') AS relation")).rows[0].relation, null);
    });
    await t.test('first apply and simultaneous repeats preserve exactly three migrations', async () => {
      await applyDevelopmentMigrations(db.adminUrl, db.appPassword, true);
      await Promise.all([applyDevelopmentMigrations(db.adminUrl, db.appPassword, true), applyDevelopmentMigrations(db.adminUrl, db.appPassword, true)]);
      assert.equal(Number((await owner.query('SELECT count(*) FROM fespay_meta.migrations')).rows[0].count), 3);
      assert.equal(Number((await owner.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")).rows[0].count), 55);
      assert.equal(Number((await owner.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='auth'")).rows[0].count), 5);
    });
    await t.test('recorded checksum drift refuses application', async () => {
      const original = (await owner.query("SELECT sha256 FROM fespay_meta.migrations WHERE id='0001-business'")).rows[0].sha256;
      await owner.query("UPDATE fespay_meta.migrations SET sha256='invalid' WHERE id='0001-business'");
      try { await assert.rejects(applyDevelopmentMigrations(db.adminUrl, db.appPassword, true), /Applied migration checksum mismatch/); }
      finally { await owner.query("UPDATE fespay_meta.migrations SET sha256=$1 WHERE id='0001-business'", [original]); }
    });
    await t.test('app role cannot change schema or migration history', async () => {
      for (const sql of ['CREATE TABLE public.forbidden(id int)', 'CREATE TABLE auth.forbidden(id int)', 'SELECT * FROM fespay_meta.migrations']) {
        await assert.rejects(app.query(sql), (error: unknown) => (error as { code: string }).code === '42501');
      }
    });
    const config = readConfig({ DATABASE_URL: db.appUrl, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'https://fespay.test' });
    const auth = createAuth(config, app, async message => { delivered.push(message.url); });
    await t.test('fixed config requires no additional Better Auth migration', async () => {
      const state = await getMigrations(auth.options);
      assert.equal(state.toBeCreated.length + state.toBeAdded.length + state.toBeAddedIndexes.length, 0);
      assert.equal(state.unsafeChanges.length + state.schemaProblems.length, 0);
      const expected = await readFile(new URL('../../../database/migrations/0002-auth.sql', import.meta.url), 'utf8');
      assert.match(expected, /"auth"\."twoFactor"/);
    });
    const email = 'fixture@example.test';
    const password = randomBytes(24).toString('hex');
    const call = (path: string, body?: object, cookie?: string, origin = config.origin) => auth.handler(new Request(config.origin+'/api/auth/'+path, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'content-type': 'application/json', origin } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }));
    let cookie = '';
    await t.test('unverified email cannot create a signed-in session', async () => {
      const signup = await call('sign-up/email', { email, password, name: 'Fixture' });
      assert.equal(signup.status, 200);
      assert.equal((await signup.json()).token, null);
      assert.equal(delivered.length, 1);
      assert.equal((await call('sign-in/email', { email, password })).status, 403);
      assert.equal(await auth.api.getSession({ headers: new Headers() }), null);
    });
    await t.test('verified login uses the contract cookie and hashed password', async () => {
      assert.ok((await auth.handler(new Request(delivered[0]))).status < 400);
      assert.ok(!(await call('sign-in/email', { email, password: 'incorrect-password' })).ok);
      const signin = await call('sign-in/email', { email, password });
      assert.equal(signin.status, 200);
      const cookies = signin.headers.getSetCookie();
      const session = cookies.find(value => value.startsWith('__Host-fespay.session='));
      assert.ok(session);
      for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) assert.ok(session.toLowerCase().includes(attribute.toLowerCase()));
      assert.ok(!/;\s*Domain=/i.test(session));
      cookie = cookies.map(value => value.split(';')[0]).join('; ');
      assert.ok(await auth.api.getSession({ headers: new Headers({ cookie }) }));
      const stored = (await owner.query('SELECT password FROM auth.account WHERE "providerId"=$1', ['credential'])).rows[0].password;
      assert.ok(stored && stored !== password);
    });
    await t.test('foreign Origin is rejected by the internal handler', async () => {
      assert.equal((await call('sign-out', {}, cookie, 'https://untrusted.test')).status, 403);
    });
    await t.test('deleted session is rejected on the next call without cookie cache', async () => {
      assert.ok(cookie);
      assert.ok(await auth.api.getSession({ headers: new Headers({ cookie }) }));
      await owner.query('DELETE FROM auth.session');
      assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
    });
    await t.test('sign-out revokes a newly issued session', async () => {
      const signin = await call('sign-in/email', { email, password });
      const current = signin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      assert.ok(await auth.api.getSession({ headers: new Headers({ cookie: current }) }));
      assert.equal((await call('sign-out', {}, current)).status, 200);
      assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: current }) }), null);
    });
  } finally { await app.end(); await owner.end(); await db.stop(); }
});
