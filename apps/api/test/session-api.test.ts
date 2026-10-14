import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { createAuth } from '../src/auth.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { applyDevelopmentMigrations } from '../src/migrations.js';
import { createSessionApi } from '../src/session-api.js';
import { csrf, tokenCodec, SESSION_COOKIE, PREAUTH_COOKIE } from '../src/auth-tokens.js';
import { startDatabase } from './database.js';

test(
  'public auth session adapter with real Better Auth and isolated PostgreSQL',
  { timeout: 180000 },
  async (t) => {
    const db = await startDatabase();
    const owner = new Pool({ connectionString: db.adminUrl });
    const pool = new Pool({ connectionString: db.appUrl });
    const config = readConfig({
      DATABASE_URL: db.appUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      APP_ORIGIN: 'https://fespay.test',
    });
    const delivered = new Map<string, string>();
    let auth: ReturnType<typeof createAuth>;
    let api: ReturnType<typeof createApp>;
    const records: unknown[] = [];
    const call = async (
      path: string,
      cookies = '',
      body?: unknown,
      extra: Record<string, string> = {},
    ) => {
      const res = await api.request(config.origin + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          cookie: cookies,
          ...(body === undefined
            ? {}
            : { 'content-type': 'application/json', origin: config.origin }),
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      records.push({
        path: path.split('?')[0],
        method: body === undefined ? 'GET' : 'POST',
        status: res.status,
        body: data,
        headers: Object.fromEntries(res.headers),
      });
      return { res, data };
    };
    const failure = async (
      path: string,
      expected: string,
      status: number,
      cookies = '',
      body?: unknown,
      extra = {},
    ) => {
      const result = await call(path, cookies, body, extra);
      assert.equal(result.res.status, status);
      assert.equal(result.data.code, expected);
      assert.ok(result.data.request_id);
      return result;
    };
    const internal = async (path: string, body: object) =>
      auth.handler(
        new Request(config.origin + '/api/auth/' + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: config.origin },
          body: JSON.stringify(body),
        }),
      );
    const login = async (user: { email: string; password: string }) => {
      const res = await internal('sign-in/email', user);
      assert.equal(res.status, 200);
      const cookies = res.headers
        .getSetCookie()
        .filter((value) => value.startsWith(SESSION_COOKIE + '='))
        .map((value) => value.split(';')[0])
        .join('; ');
      assert.ok(cookies);
      const info = await auth.api.getSession({
        headers: new Headers({ cookie: cookies }),
        query: { disableRefresh: true },
      });
      assert.ok(info);
      return { cookies, id: info.session.id };
    };
    const seed = async (name: string, mapped = true) => {
      const user = {
        email: name.toLowerCase() + '@example.test',
        password: randomBytes(24).toString('hex'),
      };
      assert.equal((await internal('sign-up/email', { ...user, name })).status, 200);
      assert.ok((await auth.handler(new Request(delivered.get(user.email)!))).status < 400);
      const session = await login(user);
      const authUser = (
        await owner.query('SELECT id FROM auth."user" WHERE email=$1', [user.email])
      ).rows[0].id;
      const account = randomUUID();
      if (mapped) {
        await owner.query(
          'INSERT INTO public.accounts(id,auth_user_ref,version) VALUES($1,$2,$3)',
          [account, authUser, '9007199254740993'],
        );
        await owner.query(
          'INSERT INTO public.account_profiles(id,account_id,email,display_name,email_verified_at) VALUES($1,$2,$3,$4,now())',
          [randomUUID(), account, user.email, name],
        );
      }
      return { ...user, ...session, account, authUser };
    };
    const context = async (cookies: string) => {
      const result = await call('/v1/auth/context', cookies);
      assert.equal(result.res.status, 200);
      return result.data.csrf_token as string;
    };
    const revoke = (cookies: string, token: string, scope = 'OTHERS') =>
      call('/v1/auth/sessions/revoke', cookies, { scope }, { 'X-CSRF-Token': token });
    const count = async (userId: string) =>
      Number(
        (await owner.query('SELECT count(*) FROM auth.session WHERE "userId"=$1', [userId])).rows[0]
          .count,
      );
    try {
      await applyDevelopmentMigrations(db.adminUrl, db.appPassword, true);
      auth = createAuth(config, pool, async (message) => {
        delivered.set(message.email, message.url);
      });
      api = createApp(
        async () => {
          await pool.query('SELECT 1');
        },
        createSessionApi(config, auth, pool),
      );
      let anonymousToken = '';
      await t.test(
        'anonymous context binds CSRF to a secure preauth cookie and rotates invalid or expired cookies',
        async () => {
          const first = await call('/v1/auth/context');
          assert.equal(first.res.status, 200);
          assert.equal(first.data.authentication_stage, 'ANONYMOUS');
          anonymousToken = first.data.csrf_token;
          const value = first.res.headers
            .getSetCookie()
            .find((v) => v.startsWith(PREAUTH_COOKIE + '='))!;
          assert.ok(value);
          for (const attr of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Lax', 'Max-Age='])
            assert.ok(value.includes(attr));
          assert.ok(!/;\s*Domain=/i.test(value));
          const preauth = value.split(';')[0];
          const repeated = await call('/v1/auth/context', preauth);
          assert.equal(repeated.data.expires_at, first.data.expires_at);
          assert.equal(repeated.res.headers.getSetCookie().length, 0);
          assert.ok(
            (await call('/v1/auth/context', preauth + 'broken')).res.headers.getSetCookie().length,
          );
          const expired = tokenCodec(config.secret).sign('preauth-v1', {
            nonce: 'fixture',
            expires: Date.now() - 60000,
          });
          assert.ok(
            (
              await call('/v1/auth/context', PREAUTH_COOKIE + '=' + expired)
            ).res.headers.getSetCookie().length,
          );
          await failure('/v1/auth/session', 'AUTH_REQUIRED', 401);
          await failure('/v1/auth/sessions', 'AUTH_REQUIRED', 401);
          await failure('/v1/auth/context', 'VALIDATION_ERROR', 422, preauth + '; ' + preauth);
        },
      );
      const alice = await seed('Alice');
      const alice2 = await login(alice);
      const alice3 = await login(alice);
      const bob = await seed('Bob');
      const token = await context(alice.cookies);
      const token2 = await context(alice2.cookies);
      let publicId = '';
      await t.test(
        'transport failures return the declared Error envelope before mutating sessions',
        async () => {
          for (const [body, media, status, code] of [
            ['{"scope":"ALL","scope":"CURRENT"}', 'application/json', 400, 'MALFORMED_REQUEST'],
            ['[]', 'application/json', 422, 'VALIDATION_ERROR'],
            ['x'.repeat(262145), 'application/json', 413, 'PAYLOAD_TOO_LARGE'],
            ['{}', 'text/plain', 415, 'UNSUPPORTED_MEDIA_TYPE'],
          ] as const) {
            const res = await api.request(config.origin + '/v1/auth/sessions/revoke', {
              method: 'POST',
              headers: {
                cookie: alice.cookies,
                origin: config.origin,
                'content-type': media,
                'X-CSRF-Token': token,
              },
              body,
            });
            const data = await res.json();
            assert.equal(res.status, status);
            assert.equal(data.code, code);
            records.push({
              path: '/v1/auth/sessions/revoke',
              method: 'POST',
              status: res.status,
              body: data,
              headers: Object.fromEntries(res.headers),
            });
          }
          assert.equal(await count(alice.authUser), 3);
        },
      );
      await t.test(
        'session response maps stable public UUIDs and exact account versions without private identifiers',
        async () => {
          const { res, data } = await call('/v1/auth/session', alice.cookies);
          assert.equal(res.status, 200);
          publicId = data.session_id;
          assert.match(publicId, /^[a-f0-9-]{36}$/);
          assert.notEqual(publicId, alice.id);
          assert.equal(data.account.account_id, alice.account);
          assert.equal(data.account.version, '9007199254740993');
          assert.equal(data.account.email, alice.email);
          assert.equal(data.business_mfa_expires_at, null);
          assert.equal(data.privileged_mfa_verified_at, null);
          assert.equal((await call('/v1/auth/session', alice.cookies)).data.session_id, publicId);
          assert.ok(!JSON.stringify(data).includes(alice.authUser));
          assert.ok(!JSON.stringify(data).includes(alice.id));
          assert.ok(res.headers.getSetCookie()[0].includes('Max-Age=604800'));
          const verified = new Date(Date.now() - 60000);
          const activity = new Date(Date.now() - 6000020000);
          await owner.query(
            'UPDATE public.auth_contexts SET business_mfa_verified_at=$2,last_business_activity_at=$3,privileged_mfa_verified_at=$2 WHERE id=$1',
            [publicId, verified, activity],
          );
          const mfa = (await call('/v1/auth/session', alice.cookies)).data;
          assert.equal(
            mfa.business_mfa_expires_at,
            new Date(activity.getTime() + 30 * 60000).toISOString(),
          );
          assert.equal(mfa.privileged_mfa_verified_at, verified.toISOString());
          assert.equal(
            (
              await owner.query(
                'SELECT last_business_activity_at FROM public.auth_contexts WHERE id=$1',
                [publicId],
              )
            ).rows[0].last_business_activity_at.toISOString(),
            activity.toISOString(),
          );
        },
      );
      await t.test(
        'list pagination is stable for ties, scoped to the actor and rejects foreign or expired cursors',
        async () => {
          await owner.query(
            'UPDATE auth.session SET "createdAt"=now()-interval \'1 hour\' WHERE "userId"=$1',
            [alice.authUser],
          );
          let next: string | null = null;
          const ids: string[] = [];
          let firstCursor = '';
          do {
            const { res, data } = await call(
              '/v1/auth/sessions?limit=1' + (next ? '&cursor=' + encodeURIComponent(next) : ''),
              alice.cookies,
            );
            assert.equal(res.status, 200);
            ids.push(...data.items.map((item: { session_id: string }) => item.session_id));
            next = data.next_cursor;
            firstCursor ||= next ?? '';
          } while (next);
          assert.equal(ids.length, 3);
          assert.equal(new Set(ids).size, 3);
          assert.ok(ids.includes(publicId));
          const bobPage = await call('/v1/auth/sessions', bob.cookies);
          assert.equal(bobPage.data.items.length, 1);
          assert.ok(!ids.includes(bobPage.data.items[0].session_id));
          await failure(
            '/v1/auth/sessions?cursor=' + encodeURIComponent(firstCursor),
            'CURSOR_INVALID',
            422,
            bob.cookies,
          );
          await failure(
            '/v1/auth/sessions?cursor=' + encodeURIComponent(firstCursor + '!'),
            'CURSOR_INVALID',
            422,
            alice.cookies,
          );
          const expired = tokenCodec(config.secret).sign(
            'sessions-cursor-v1',
            {
              owner: alice.account,
              created: new Date().toISOString(),
              id: publicId,
              expires: Date.now() - 60000,
            },
            alice.account,
          );
          await failure(
            '/v1/auth/sessions?cursor=' + expired,
            'CURSOR_INVALID',
            422,
            alice.cookies,
          );
          for (const query of ['limit=0', 'limit=101', 'limit=1&limit=2', 'unknown=x'])
            await failure('/v1/auth/sessions?' + query, 'VALIDATION_ERROR', 422, alice.cookies);
        },
      );
      await t.test(
        'Origin and CSRF must match the current session; rejected commands leave rows unchanged',
        async () => {
          const before = await count(alice.authUser);
          for (const headers of [
            { origin: '' },
            { origin: 'https://foreign.test' },
            { 'X-CSRF-Token': token2 },
            { 'X-CSRF-Token': anonymousToken },
            { 'X-CSRF-Token': '' },
            {
              'X-CSRF-Token': csrf(
                tokenCodec(config.secret),
                'session:' + alice.id,
                Date.now() - 60000,
              ),
            },
          ]) {
            await failure(
              '/v1/auth/sessions/revoke',
              'CSRF_INVALID',
              403,
              alice.cookies,
              { scope: 'ALL' },
              { 'X-CSRF-Token': token, ...headers },
            );
          }
          await failure(
            '/v1/auth/sessions/revoke',
            'VALIDATION_ERROR',
            422,
            alice.cookies,
            { scope: 'ALL', extra: true },
            { 'X-CSRF-Token': token },
          );
          await failure(
            '/v1/auth/sessions/revoke',
            'VALIDATION_ERROR',
            422,
            alice.cookies,
            { scope: 'ALL' },
            { 'X-CSRF-Token': token, 'X-FesPay-Client-Revision': '01' },
          );
          assert.equal(await count(alice.authUser), before);
        },
      );
      await t.test(
        'OTHERS revokes only other sessions, supports old clients and persists a secret-free audit atomically',
        async () => {
          const { res, data } = await call(
            '/v1/auth/sessions/revoke',
            alice.cookies,
            { scope: 'OTHERS' },
            { 'X-CSRF-Token': token, 'X-FesPay-Client-Revision': '0' },
          );
          assert.equal(res.status, 200);
          assert.equal(data.revoked_count, 2);
          assert.equal(data.current_session_revoked, false);
          await failure('/v1/auth/session', 'AUTH_REQUIRED', 401, alice2.cookies);
          await failure('/v1/auth/session', 'AUTH_REQUIRED', 401, alice3.cookies);
          assert.equal((await call('/v1/auth/session', bob.cookies)).res.status, 200);
          assert.equal((await revoke(alice.cookies, token)).data.revoked_count, 0);
          const audits = (
            await owner.query(
              'SELECT * FROM public.audit WHERE actor_account_id=$1 ORDER BY created_at',
              [alice.account],
            )
          ).rows;
          assert.equal(audits.length, 2);
          assert.ok(audits.every((row) => row.request_id));
          assert.equal(audits[0].safe_changes.revoked_count, 2);
          const safe = JSON.stringify(audits);
          assert.ok(!safe.includes(token));
          assert.ok(!safe.includes(alice.id));
          assert.ok(!safe.includes(alice.cookies));
        },
      );
      await t.test(
        'two-device concurrent ALL requests cannot deadlock or revoke another actor',
        async () => {
          const other = await login(alice);
          const otherToken = await context(other.cookies);
          const results = await Promise.all([
            revoke(alice.cookies, token, 'ALL'),
            revoke(other.cookies, otherToken, 'ALL'),
          ]);
          assert.deepEqual(results.map((row) => row.res.status).sort(), [200, 401]);
          assert.equal(results.find((row) => row.res.status === 200)!.data.revoked_count, 2);
          assert.equal(await count(alice.authUser), 0);
          assert.equal((await call('/v1/auth/session', bob.cookies)).res.status, 200);
          await failure(
            '/v1/auth/sessions/revoke',
            'AUTH_REQUIRED',
            401,
            alice.cookies,
            { scope: 'ALL' },
            { 'X-CSRF-Token': token },
          );
        },
      );
      await t.test(
        'CURRENT clears cookies and rejects the old session on its next use',
        async () => {
          const current = await login(alice);
          const currentToken = await context(current.cookies);
          const { res, data } = await revoke(current.cookies, currentToken, 'CURRENT');
          assert.equal(res.status, 200);
          assert.equal(data.revoked_count, 1);
          assert.equal(data.current_session_revoked, true);
          assert.equal(res.headers.getSetCookie().length, 2);
          assert.ok(res.headers.getSetCookie().every((value) => value.includes('Max-Age=0')));
          await failure('/v1/auth/session', 'AUTH_REQUIRED', 401, current.cookies);
          assert.equal(
            (await call('/v1/auth/context', current.cookies)).data.authentication_stage,
            'ANONYMOUS',
          );
        },
      );
      await t.test(
        'idle and absolute expiry override a future library expiry and cap renewed cookie lifetime',
        async () => {
          for (const field of ['createdAt', 'updatedAt']) {
            const session = await login(alice);
            await owner.query(
              'UPDATE auth.session SET "expiresAt"=now()+interval \'60 days\',"' +
                field +
                '"=now()-interval \'' +
                (field === 'createdAt' ? '30' : '7') +
                " days' WHERE id=$1",
              [session.id],
            );
            await failure('/v1/auth/session', 'AUTH_REQUIRED', 401, session.cookies);
            assert.equal(
              (await owner.query('SELECT 1 FROM auth.session WHERE id=$1', [session.id])).rowCount,
              0,
            );
          }
          const old = await login(alice);
          await owner.query(
            'UPDATE auth.session SET "createdAt"=now()-interval \'29 days\' WHERE id=$1',
            [old.id],
          );
          const { res, data } = await call('/v1/auth/session', old.cookies);
          assert.equal(res.status, 200);
          assert.equal(data.idle_expires_at, data.absolute_expires_at);
          const age = Number(res.headers.getSetCookie()[0].match(/Max-Age=(\d+)/)![1]);
          assert.ok(age <= 86400 && age > 86000);
          await owner.query(
            'UPDATE public.auth_contexts SET revoked_at=now() WHERE auth_session_ref=$1',
            [old.id],
          );
          await failure('/v1/auth/session', 'AUTH_REQUIRED', 401, old.cookies);
        },
      );
      await t.test(
        'account linkage, verification and current status fail closed while locked actors can recover sessions',
        async () => {
          const unmapped = await seed('Unmapped', false);
          await failure('/v1/auth/session', 'DEPENDENCY_UNAVAILABLE', 503, unmapped.cookies);
          assert.equal(
            (
              await owner.query('SELECT 1 FROM public.accounts WHERE auth_user_ref=$1', [
                unmapped.authUser,
              ])
            ).rowCount,
            0,
          );
          await owner.query('UPDATE auth."user" SET "emailVerified"=false WHERE id=$1', [
            bob.authUser,
          ]);
          await failure('/v1/auth/session', 'FORBIDDEN', 403, bob.cookies);
          await owner.query('UPDATE auth."user" SET "emailVerified"=true WHERE id=$1', [
            bob.authUser,
          ]);
          await owner.query("UPDATE public.accounts SET status='SUSPENDED' WHERE id=$1", [
            bob.account,
          ]);
          assert.equal((await call('/v1/auth/session', bob.cookies)).data.account.status, 'LOCKED');
          await owner.query("UPDATE public.accounts SET status='DELETED' WHERE id=$1", [
            bob.account,
          ]);
          await failure('/v1/auth/session', 'AUTH_REQUIRED', 401, bob.cookies);
          await owner.query("UPDATE public.accounts SET status='ACTIVE' WHERE id=$1", [
            bob.account,
          ]);
          await owner.query(
            'UPDATE public.auth_contexts SET account_id=$2 WHERE auth_session_ref=$1',
            [bob.id, alice.account],
          );
          await failure('/v1/auth/session', 'DB_UNAVAILABLE', 503, bob.cookies);
          await owner.query(
            'UPDATE public.auth_contexts SET account_id=$2 WHERE auth_session_ref=$1',
            [bob.id, bob.account],
          );
        },
      );
      await t.test(
        'failed audit rolls back revocation and DB outage returns an Error rather than anonymous context',
        async () => {
          const current = await login(alice);
          const currentToken = await context(current.cookies);
          const before = await count(alice.authUser);
          await owner.query('REVOKE INSERT ON public.audit FROM fespay_app');
          try {
            await failure(
              '/v1/auth/sessions/revoke',
              'DB_UNAVAILABLE',
              503,
              current.cookies,
              { scope: 'ALL' },
              { 'X-CSRF-Token': currentToken },
            );
            assert.equal(await count(alice.authUser), before);
            assert.equal((await call('/v1/auth/session', current.cookies)).res.status, 200);
          } finally {
            await owner.query('GRANT INSERT ON public.audit TO fespay_app');
          }
          await pool.end();
          const { res, data } = await failure(
            '/v1/auth/context',
            'DB_UNAVAILABLE',
            503,
            current.cookies,
          );
          assert.equal(res.headers.getSetCookie().length, 0);
          assert.ok(!JSON.stringify(data).includes(db.appUrl));
        },
      );
      await t.test(
        'all exercised success and failure responses satisfy adopted OpenAPI schemas and headers',
        () => {
          const localPython = fileURLToPath(new URL('../../../.venv/bin/python', import.meta.url));
          const python = process.env.PYTHON ?? (existsSync(localPython) ? localPython : 'python3');
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
