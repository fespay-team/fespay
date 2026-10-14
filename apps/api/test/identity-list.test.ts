import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { createAuth } from '../src/auth.js';
import { createApp } from '../src/app.js';
import { createSessionApi } from '../src/session-api.js';
import { readConfig } from '../src/config.js';
import { applyDevelopmentMigrations } from '../src/migrations.js';
import { SESSION_COOKIE } from '../src/auth-tokens.js';
import { startDatabase } from './database.js';

test(
  'identity listing and upgrade preserve private authentication data',
  { timeout: 120000 },
  async (t) => {
    const db = await startDatabase();
    const owner = new Pool({ connectionString: db.adminUrl });
    const pool = new Pool({ connectionString: db.appUrl });
    const config = readConfig({
      DATABASE_URL: db.appUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      APP_ORIGIN: 'https://fespay.test',
    });
    const records: unknown[] = [];
    try {
      await applyDevelopmentMigrations(db.adminUrl, db.appPassword, true);
      await t.test(
        'upgrade from the previous two migrations backfills UUIDs without changing secrets or existing rows',
        async () => {
          // Reproduce the exact previous account columns/history on an isolated DB.
          await owner.query(
            'ALTER TABLE auth.account DROP COLUMN "fespayIdentityId"; DELETE FROM fespay_meta.migrations WHERE id=\'0003-identity-public-id\'',
          );
          const legacyUser = randomUUID();
          await owner.query(
            'INSERT INTO auth."user"(id,name,email,"emailVerified") VALUES($1,\'Legacy\',\'legacy@example.test\',true)',
            [legacyUser],
          );
          for (const provider of ['credential', 'google']) {
            await owner.query(
              'INSERT INTO auth.account(id,"userId","accountId","providerId",password,"accessToken","refreshToken","idToken","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())',
              [
                randomUUID(),
                legacyUser,
                provider === 'credential' ? legacyUser : randomUUID(),
                provider,
                provider === 'credential' ? randomBytes(32).toString('hex') : null,
                ...Array.from({ length: 3 }, () => randomBytes(32).toString('hex')),
              ],
            );
          }
          await owner.query(
            'INSERT INTO auth.session(id,"userId",token,"expiresAt","updatedAt") VALUES($1,$2,$3,now()+interval \'7 days\',now())',
            [randomUUID(), legacyUser, randomBytes(32).toString('hex')],
          );
          const before = (
            await owner.query('SELECT * FROM auth.account WHERE "userId"=$1 ORDER BY id', [
              legacyUser,
            ])
          ).rows;
          const userBefore = (
            await owner.query('SELECT * FROM auth."user" WHERE id=$1', [legacyUser])
          ).rows;
          const sessionsBefore = (
            await owner.query('SELECT * FROM auth.session WHERE "userId"=$1', [legacyUser])
          ).rows;
          assert.deepEqual(
            (await applyDevelopmentMigrations(db.adminUrl, '', true, true)).map(
              (row) => row.status,
            ),
            ['applied', 'applied', 'pending'],
          );
          await applyDevelopmentMigrations(db.adminUrl, db.appPassword, true);
          const after = (
            await owner.query('SELECT * FROM auth.account WHERE "userId"=$1 ORDER BY id', [
              legacyUser,
            ])
          ).rows;
          for (const row of after)
            assert.match(row.fespayIdentityId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
          assert.equal(new Set(after.map((row) => row.fespayIdentityId)).size, 2);
          assert.deepEqual(
            after.map(({ fespayIdentityId, ...row }) => row),
            before,
          );
          assert.deepEqual(
            (await owner.query('SELECT * FROM auth."user" WHERE id=$1', [legacyUser])).rows,
            userBefore,
          );
          assert.deepEqual(
            (await owner.query('SELECT * FROM auth.session WHERE "userId"=$1', [legacyUser])).rows,
            sessionsBefore,
          );
          await Promise.all([
            applyDevelopmentMigrations(db.adminUrl, db.appPassword, true),
            applyDevelopmentMigrations(db.adminUrl, db.appPassword, true),
          ]);
          assert.deepEqual(
            (
              await owner.query('SELECT * FROM auth.account WHERE "userId"=$1 ORDER BY id', [
                legacyUser,
              ])
            ).rows,
            after,
          );
          assert.equal(
            (await owner.query('SELECT count(*)::int AS n FROM fespay_meta.migrations')).rows[0].n,
            3,
          );
          await assert.rejects(
            owner.query('UPDATE auth.account SET "fespayIdentityId"=$2 WHERE id=$1', [
              after[0].id,
              after[1].fespayIdentityId,
            ]),
            (e: unknown) => (e as { code: string }).code === '23505',
          );
          await assert.rejects(
            owner.query('UPDATE auth.account SET "fespayIdentityId"=\'not-a-uuid\' WHERE id=$1', [
              after[0].id,
            ]),
            (e: unknown) => (e as { code: string }).code === '23514',
          );
        },
      );
      const delivered = new Map<string, string>();
      const auth = createAuth(config, pool, async (m) => {
        delivered.set(m.email, m.url);
      });
      const api = createApp(async () => {}, createSessionApi(config, auth, pool));
      const internal = (path: string, body: object) =>
        auth.handler(
          new Request(config.origin + '/api/auth/' + path, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: config.origin },
            body: JSON.stringify(body),
          }),
        );
      const seed = async (name: string) => {
        const email = name + '@example.test';
        const password = randomBytes(24).toString('hex');
        assert.equal((await internal('sign-up/email', { email, password, name })).status, 200);
        assert.ok((await auth.handler(new Request(delivered.get(email)!))).status < 400);
        const signin = await internal('sign-in/email', { email, password });
        assert.equal(signin.status, 200);
        const cookie = signin.headers
          .getSetCookie()
          .find((v) => v.startsWith(SESSION_COOKIE + '='))!
          .split(';')[0];
        const session = await auth.api.getSession({
          headers: new Headers({ cookie }),
          query: { disableRefresh: true },
        });
        assert.ok(session);
        const accountId = randomUUID();
        await owner.query('INSERT INTO public.accounts(id,auth_user_ref) VALUES($1,$2)', [
          accountId,
          session.user.id,
        ]);
        await owner.query(
          'INSERT INTO public.account_profiles(id,account_id,email,display_name,email_verified_at) VALUES($1,$2,$3,$4,now())',
          [randomUUID(), accountId, email, name],
        );
        return {
          cookie,
          userId: session.user.id,
          sessionId: session.session.id,
          accountId,
          email,
          password,
        };
      };
      const alice = await seed('identity-alice');
      const bob = await seed('identity-bob');
      const call = async (cookies = '', query = '') => {
        const res = await api.request(config.origin + '/v1/auth/identities' + query, {
          headers: { cookie: cookies },
        });
        const body = await res.json();
        records.push({
          method: 'GET',
          path: '/v1/auth/identities',
          status: res.status,
          body,
          headers: Object.fromEntries(res.headers),
        });
        return { res, body };
      };
      const fail = async (cookies: string, status: number, code: string, query = '') => {
        const result = await call(cookies, query);
        assert.equal(result.res.status, status);
        assert.equal(result.body.code, code);
        return result;
      };
      let identityId = '';
      await t.test(
        'real verified email login exposes only its public credential identity and never another actor',
        async () => {
          const { res, body } = await call(alice.cookie);
          assert.equal(res.status, 200);
          assert.equal(body.items.length, 1);
          assert.equal(body.items[0].provider, 'EMAIL_PASSWORD');
          identityId = body.items[0].identity_id;
          const stored = (
            await owner.query('SELECT * FROM auth.account WHERE "userId"=$1', [alice.userId])
          ).rows[0];
          assert.equal(identityId, stored.fespayIdentityId);
          assert.notEqual(identityId, stored.id);
          const internalAccounts = await auth.api.listUserAccounts({
            headers: new Headers({ cookie: alice.cookie }),
          });
          assert.ok(internalAccounts.every((row) => !Object.hasOwn(row, 'fespayIdentityId')));
          assert.equal(
            (await api.request('/api/auth/list-accounts', { headers: { cookie: alice.cookie } }))
              .status,
            404,
          );
          assert.equal(body.items[0].linked_at, stored.createdAt.toISOString());
          assert.deepEqual(Object.keys(body.items[0]).sort(), [
            'identity_id',
            'linked_at',
            'provider',
          ]);
          const text = JSON.stringify(body);
          for (const secret of [
            stored.password,
            stored.id,
            stored.accountId,
            alice.userId,
            alice.cookie,
          ])
            assert.ok(!text.includes(secret));
          const bobResult = await call(bob.cookie);
          assert.ok(
            !bobResult.body.items.some(
              (v: { identity_id: string }) => v.identity_id === identityId,
            ),
          );
        },
      );
      const googleId = randomUUID();
      const googleSubject = randomUUID();
      const secrets = Array.from({ length: 3 }, () => randomBytes(32).toString('hex'));
      await t.test(
        'a Google fixture yields the declared two-provider DTO without OAuth secrets',
        async () => {
          await owner.query(
            'INSERT INTO auth.account(id,"userId","accountId","providerId","accessToken","refreshToken","idToken","updatedAt") VALUES($1,$2,$3,\'google\',$4,$5,$6,now())',
            [googleId, alice.userId, googleSubject, ...secrets],
          );
          const result = await call(alice.cookie);
          assert.equal(result.res.status, 200);
          assert.deepEqual(
            result.body.items.map((v: { provider: string }) => v.provider),
            ['EMAIL_PASSWORD', 'GOOGLE'],
          );
          const text = JSON.stringify(result.body);
          for (const secret of [googleId, googleSubject, ...secrets])
            assert.ok(!text.includes(secret));
          assert.ok(
            !result.body.items.some((v: { identity_id: string }) => v.identity_id === googleId),
          );
        },
      );
      await t.test(
        'parallel reads and server-secret rotation preserve persisted public IDs',
        async () => {
          const results = await Promise.all(Array.from({ length: 5 }, () => call(alice.cookie)));
          const expected = results[0].body.items;
          assert.ok(results.every((result) => result.res.status === 200));
          for (const result of results) assert.deepEqual(result.body.items, expected);
          const rows = (
            await owner.query(
              'SELECT "fespayIdentityId" FROM auth.account WHERE "userId"=$1 ORDER BY "providerId"',
              [alice.userId],
            )
          ).rows;
          // A new signing secret invalidates old sessions, but never changes public IDs.
          const rotatedConfig = { ...config, secret: randomBytes(32).toString('hex') };
          const rotated = createAuth(rotatedConfig, pool);
          const newSign = await rotated.handler(
            new Request(config.origin + '/api/auth/sign-in/email', {
              method: 'POST',
              headers: { 'content-type': 'application/json', origin: config.origin },
              body: JSON.stringify({
                email: alice.email,
                password: alice.password,
              }),
            }),
          );
          assert.equal(newSign.status, 200);
          const rotatedCookie = newSign.headers
            .getSetCookie()
            .find((value) => value.startsWith(SESSION_COOKIE + '='))!
            .split(';')[0];
          const rotatedApi = createApp(
            async () => {},
            createSessionApi(rotatedConfig, rotated, pool),
          );
          const rotatedResponse = await rotatedApi.request(config.origin + '/v1/auth/identities', {
            headers: { cookie: rotatedCookie },
          });
          const rotatedBody = await rotatedResponse.json();
          assert.equal(rotatedResponse.status, 200);
          assert.deepEqual(rotatedBody.items, expected);
          records.push({
            method: 'GET',
            path: '/v1/auth/identities',
            status: rotatedResponse.status,
            body: rotatedBody,
            headers: Object.fromEntries(rotatedResponse.headers),
          });
          assert.deepEqual(
            (
              await owner.query(
                'SELECT "fespayIdentityId" FROM auth.account WHERE "userId"=$1 ORDER BY "providerId"',
                [alice.userId],
              )
            ).rows,
            rows,
          );
        },
      );
      await t.test(
        'a Google-only database fixture can inspect identities without setting a password',
        async () => {
          const googleOnly = await seed('identity-google-only');
          await owner.query('DELETE FROM auth.account WHERE "userId"=$1', [googleOnly.userId]);
          await owner.query(
            'INSERT INTO auth.account(id,"userId","accountId","providerId","updatedAt") VALUES($1,$2,$3,\'google\',now())',
            [randomUUID(), googleOnly.userId, randomUUID()],
          );
          const result = await call(googleOnly.cookie);
          assert.equal(result.res.status, 200);
          assert.equal(result.body.items.length, 1);
          assert.equal(result.body.items[0].provider, 'GOOGLE');
          assert.equal(
            (
              await owner.query(
                'SELECT 1 FROM auth.account WHERE "userId"=$1 AND "providerId"=\'credential\'',
                [googleOnly.userId],
              )
            ).rowCount,
            0,
          );
        },
      );
      await t.test(
        'anonymous, revoked, locked/deleted actors and query input respect the existing session boundary',
        async () => {
          await fail('', 401, 'AUTH_REQUIRED');
          await fail(alice.cookie, 422, 'VALIDATION_ERROR', '?account_id=' + bob.accountId);
          await owner.query("UPDATE public.accounts SET status='SUSPENDED' WHERE id=$1", [
            bob.accountId,
          ]);
          assert.equal((await call(bob.cookie)).res.status, 200);
          await owner.query("UPDATE public.accounts SET status='DELETED' WHERE id=$1", [
            bob.accountId,
          ]);
          await fail(bob.cookie, 401, 'AUTH_REQUIRED');
          await owner.query("UPDATE public.accounts SET status='ACTIVE' WHERE id=$1", [
            bob.accountId,
          ]);
          await owner.query('DELETE FROM auth.session WHERE id=$1', [bob.sessionId]);
          await fail(bob.cookie, 401, 'AUTH_REQUIRED');
        },
      );
      await t.test(
        'duplicate or unsupported providers, missing credentials and no identities fail without repair writes',
        async () => {
          const duplicate = randomUUID();
          await owner.query(
            'INSERT INTO auth.account(id,"userId","accountId","providerId","updatedAt") VALUES($1,$2,$3,\'google\',now())',
            [duplicate, alice.userId, randomUUID()],
          );
          await fail(alice.cookie, 503, 'DEPENDENCY_UNAVAILABLE');
          await owner.query('DELETE FROM auth.account WHERE id=$1', [duplicate]);
          await owner.query('UPDATE auth.account SET "providerId"=\'unsupported\' WHERE id=$1', [
            googleId,
          ]);
          await fail(alice.cookie, 503, 'DEPENDENCY_UNAVAILABLE');
          await owner.query('UPDATE auth.account SET "providerId"=\'google\' WHERE id=$1', [
            googleId,
          ]);
          const original = (
            await owner.query(
              'SELECT password FROM auth.account WHERE "userId"=$1 AND "providerId"=\'credential\'',
              [alice.userId],
            )
          ).rows[0].password;
          await owner.query(
            'UPDATE auth.account SET password=NULL WHERE "userId"=$1 AND "providerId"=\'credential\'',
            [alice.userId],
          );
          await fail(alice.cookie, 503, 'DEPENDENCY_UNAVAILABLE');
          await owner.query(
            'UPDATE auth.account SET password=$2 WHERE "userId"=$1 AND "providerId"=\'credential\'',
            [alice.userId, original],
          );
          await owner.query('DELETE FROM auth.account WHERE id=$1', [googleId]);
          const saved = (
            await owner.query('SELECT * FROM auth.account WHERE "userId"=$1', [alice.userId])
          ).rows[0];
          await owner.query('DELETE FROM auth.account WHERE id=$1', [saved.id]);
          await fail(alice.cookie, 503, 'DEPENDENCY_UNAVAILABLE');
          await owner.query(
            'INSERT INTO auth.account(id,"userId","accountId","providerId",password,"updatedAt","fespayIdentityId") VALUES($1,$2,$3,\'credential\',$4,now(),$5)',
            [saved.id, alice.userId, alice.userId, saved.password, saved.fespayIdentityId],
          );
          assert.equal((await call(alice.cookie)).body.items[0].identity_id, identityId);
        },
      );
      await t.test(
        'a database outage cannot return partial identities or reflect internal credentials',
        async () => {
          await pool.end();
          const result = await fail(alice.cookie, 503, 'DB_UNAVAILABLE');
          assert.ok(!JSON.stringify(result.body).includes(db.appUrl));
        },
      );
      await t.test(
        'real responses conform to the adopted IdentityList/Error schemas and headers',
        async () => {
          const local = fileURLToPath(new URL('../../../.venv/bin/python', import.meta.url));
          const python =
            process.env.PYTHON ??
            (await access(local).then(
              () => local,
              () => 'python3',
            ));
          const result = spawnSync(
            python,
            [fileURLToPath(new URL('./validate-responses.py', import.meta.url))],
            { input: JSON.stringify(records), encoding: 'utf8' },
          );
          assert.equal(result.status, 0, result.stderr);
          t.diagnostic(result.stdout.trim());
        },
      );
    } finally {
      if (!pool.ended) await pool.end();
      await owner.end();
      await db.stop();
    }
  },
);
