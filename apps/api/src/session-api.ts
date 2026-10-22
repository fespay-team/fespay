import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Pool, PoolClient } from 'pg';
import type { Config } from './config.js';
import type { createAuth } from './auth.js';
import { ApiError, readJson } from './http-input.js';
import { listIdentities } from './identity-list.js';
import { createChargeApi } from './charge-api.js';
import { createWalletApi } from './wallet-api.js';
import {
  cookie,
  csrf,
  validCsrf,
  tokenCodec,
  setCookie,
  SESSION_COOKIE,
  PREAUTH_COOKIE,
  CONTEXT_LIFETIME,
} from './auth-tokens.js';

const DAY = 86400000;
type Actor = {
  privateId: string;
  userId: string;
  accountId: string;
  publicId: string;
  now: number;
  created: Date;
  expires: number;
  absolute: number;
  account: {
    account_id: string;
    display_name: string;
    email: string;
    email_verified: boolean;
    status: string;
    version: string;
  };
  mfaExpires: number | null;
  privilegedMfa: Date | null;
};
const unauthorized = () => new ApiError('AUTH_REQUIRED', 401);
const unavailable = () => new ApiError('DB_UNAVAILABLE', 503, true);

export function createSessionApi(config: Config, auth: ReturnType<typeof createAuth>, pool: Pool) {
  const router = new Hono();
  const codec = tokenCodec(config.secret);
  const requestIds = new WeakMap<Request, string>();
  // All operations acquire the business account before any session row. Two
  // devices of one actor cannot deadlock by holding each other's session first.
  async function withActor<T>(
    headers: Headers,
    action: (client: PoolClient, actor: Actor) => Promise<T>,
  ): Promise<T | null> {
    cookie(headers, SESSION_COOKIE);
    cookie(headers, PREAUTH_COOKIE);
    let verified;
    try {
      verified = await auth.api.getSession({
        headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
    } catch {
      throw unavailable();
    }
    if (!verified) return null;
    let client: PoolClient | undefined;
    let transaction = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      transaction = true;
      const account = (
        await client.query(
          'SELECT id,status,version::text FROM public.accounts WHERE auth_user_ref=$1 FOR UPDATE',
          [verified.user.id],
        )
      ).rows[0];
      if (!account) throw new ApiError('DEPENDENCY_UNAVAILABLE', 503, true); // Never provision a business account from GET.
      if (account.status === 'DELETED') throw unauthorized();
      const session = (
        await client.query(
          'SELECT s.*,u."emailVerified",u.email AS auth_email FROM auth.session s JOIN auth."user" u ON u.id=s."userId" WHERE s.id=$1 AND s."userId"=$2 FOR UPDATE OF s',
          [verified.session.id, verified.user.id],
        )
      ).rows[0];
      if (!session) throw unauthorized();
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now.getTime();
      const absolute = session.createdAt.getTime() + 30 * DAY;
      const oldExpiry = Math.min(
        session.expiresAt.getTime(),
        session.updatedAt.getTime() + 7 * DAY,
        absolute,
      );
      if (now >= oldExpiry) {
        await client.query(
          'UPDATE public.auth_contexts SET revoked_at=coalesce(revoked_at,$2),updated_at=$2,version=version+1 WHERE auth_session_ref=$1',
          [session.id, new Date(now)],
        );
        await client.query('DELETE FROM auth.session WHERE id=$1', [session.id]);
        await client.query('COMMIT');
        transaction = false;
        return null;
      }
      if (!session.emailVerified) throw new ApiError('FORBIDDEN', 403);
      const profile = (
        await client.query(
          'SELECT display_name,email::text,email_verified_at FROM public.account_profiles WHERE account_id=$1',
          [account.id],
        )
      ).rows[0];
      if (
        !profile ||
        profile.email.toLowerCase() !== session.auth_email.toLowerCase() ||
        !profile.display_name ||
        [...profile.display_name].length > 40 ||
        /[\x00-\x1f\x7f]/.test(profile.display_name)
      )
        throw new ApiError('DEPENDENCY_UNAVAILABLE', 503, true);
      await client.query(
        'INSERT INTO public.auth_contexts(id,account_id,auth_session_ref) VALUES($1,$2,$3) ON CONFLICT(auth_session_ref) DO NOTHING',
        [randomUUID(), account.id, session.id],
      );
      const context = (
        await client.query(
          'SELECT * FROM public.auth_contexts WHERE auth_session_ref=$1 FOR UPDATE',
          [session.id],
        )
      ).rows[0];
      if (context.account_id !== account.id) throw unavailable();
      if (context.revoked_at) {
        await client.query('DELETE FROM auth.session WHERE id=$1', [session.id]);
        await client.query('COMMIT');
        transaction = false;
        return null;
      }
      const expires = Math.min(now + 7 * DAY, absolute);
      await client.query('UPDATE auth.session SET "updatedAt"=$2,"expiresAt"=$3 WHERE id=$1', [
        session.id,
        new Date(now),
        new Date(expires),
      ]);
      const mfaExpires =
        context.business_mfa_verified_at && context.last_business_activity_at
          ? Math.min(
              context.business_mfa_verified_at.getTime() + 8 * 3600000,
              context.last_business_activity_at.getTime() + 30 * 60000,
            )
          : null;
      const result = await action(client, {
        privateId: session.id,
        userId: verified.user.id,
        accountId: account.id,
        publicId: context.id,
        now,
        created: session.createdAt,
        expires,
        absolute,
        account: {
          account_id: account.id,
          display_name: profile.display_name,
          email: profile.email,
          email_verified: !!profile.email_verified_at,
          status: account.status === 'SUSPENDED' ? 'LOCKED' : account.status,
          version: account.version,
        },
        mfaExpires,
        privilegedMfa: context.privileged_mfa_verified_at,
      });
      await client.query('COMMIT');
      transaction = false;
      return result;
    } catch (error) {
      if (transaction && client) await client.query('ROLLBACK').catch(() => {});
      if (error instanceof ApiError) throw error;
      throw unavailable();
    } finally {
      client?.release();
    }
  }
  function response(data: unknown, cookies: string[] = []) {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-FesPay-Contract-Revision': '1',
      'X-FesPay-Min-Write-Revision': '1',
    });
    for (const value of cookies) headers.append('Set-Cookie', value);
    return new Response(JSON.stringify(data), { status: 200, headers });
  }
  function sessionCookie(headers: Headers, actor: Actor) {
    return setCookie(SESSION_COOKIE, cookie(headers, SESSION_COOKIE)!, actor.expires, actor.now);
  }
  function query(request: Request, allowed: string[]) {
    const params = new URL(request.url).searchParams;
    for (const key of params.keys())
      if (!allowed.includes(key) || params.getAll(key).length !== 1)
        throw new ApiError('VALIDATION_ERROR', 422);
    return params;
  }
  router.onError((error, c) => {
    const failure = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR', 500, true);
    return new Response(
      JSON.stringify({
        code: failure.code,
        message: '要求を完了できません。認証状態または入力を確認してください。',
        request_id: requestIds.get(c.req.raw) ?? randomUUID(),
        retryable: failure.retryable,
      }),
      {
        status: failure.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-FesPay-Contract-Revision': '1',
          'X-FesPay-Min-Write-Revision': '1',
        },
      },
    );
  });
  router.use('/v1/*', async (c, next) => {
    requestIds.set(c.req.raw, randomUUID());
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-FesPay-Contract-Revision', '1');
    c.header('X-FesPay-Min-Write-Revision', '1');
  });
  router.get('/v1/auth/context', async (c) => {
    query(c.req.raw, []);
    const authenticated = await withActor(c.req.raw.headers, async (_client, actor) =>
      response(
        {
          csrf_token: csrf(
            codec,
            'session:' + actor.privateId,
            Math.min(actor.now + CONTEXT_LIFETIME, actor.expires),
          ),
          expires_at: new Date(Math.min(actor.now + CONTEXT_LIFETIME, actor.expires)).toISOString(),
          authenticated: true,
          authentication_stage: 'AUTHENTICATED',
          checked_at: new Date(actor.now).toISOString(),
        },
        [sessionCookie(c.req.raw.headers, actor), setCookie(PREAUTH_COOKIE, '', 0, actor.now)],
      ),
    );
    if (authenticated) return authenticated;
    const now = Date.now();
    const old = cookie(c.req.raw.headers, PREAUTH_COOKIE);
    let data = codec.read('preauth-v1', old) as { expires?: number; nonce?: string } | undefined;
    const cookies: string[] = [];
    let value = old;
    if (
      !data ||
      !Number.isSafeInteger(data.expires) ||
      data.expires! <= now ||
      typeof data.nonce !== 'string'
    ) {
      data = { expires: now + CONTEXT_LIFETIME, nonce: randomBytes(32).toString('base64url') };
      value = codec.sign('preauth-v1', data);
      cookies.push(setCookie(PREAUTH_COOKIE, value, data.expires!, now));
    }
    if (cookie(c.req.raw.headers, SESSION_COOKIE))
      cookies.push(setCookie(SESSION_COOKIE, '', 0, now));
    return response(
      {
        csrf_token: csrf(codec, 'preauth:' + value, data.expires!),
        expires_at: new Date(data.expires!).toISOString(),
        authenticated: false,
        authentication_stage: 'ANONYMOUS',
        checked_at: new Date(now).toISOString(),
      },
      cookies,
    );
  });
  router.get('/v1/auth/session', async (c) => {
    const result = await withActor(c.req.raw.headers, async (_client, actor) => {
      query(c.req.raw, []);
      return response(
        {
          session_id: actor.publicId,
          account: actor.account,
          idle_expires_at: new Date(actor.expires).toISOString(),
          absolute_expires_at: new Date(actor.absolute).toISOString(),
          business_mfa_expires_at:
            actor.mfaExpires === null ? null : new Date(actor.mfaExpires).toISOString(),
          privileged_mfa_verified_at: actor.privilegedMfa?.toISOString() ?? null,
          checked_at: new Date(actor.now).toISOString(),
        },
        [sessionCookie(c.req.raw.headers, actor)],
      );
    });
    if (!result) throw unauthorized();
    return result;
  });
  router.get('/v1/auth/sessions', async (c) => {
    const result = await withActor(c.req.raw.headers, async (client, actor) => {
      const params = query(c.req.raw, ['limit', 'cursor']);
      const limitText = params.get('limit') ?? '50';
      if (!/^[1-9][0-9]*$/.test(limitText) || Number(limitText) > 100)
        throw new ApiError('VALIDATION_ERROR', 422);
      const limit = Number(limitText);
      let before: { owner: string; created: string; id: string; expires: number } | undefined;
      if (params.has('cursor')) {
        before = codec.read(
          'sessions-cursor-v1',
          params.get('cursor') ?? undefined,
          actor.accountId,
        ) as typeof before;
        if (
          !before ||
          before.owner !== actor.accountId ||
          !Number.isSafeInteger(before.expires) ||
          before.expires <= actor.now ||
          !/^\d{4}-\d\d-\d\dT.*Z$/.test(before.created) ||
          !Number.isFinite(Date.parse(before.created)) ||
          !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(before.id)
        )
          throw new ApiError('CURSOR_INVALID', 422);
      }
      await client.query(
        'INSERT INTO public.auth_contexts(id,account_id,auth_session_ref) SELECT gen_random_uuid(),$1,s.id FROM auth.session s WHERE s."userId"=$2 AND s."expiresAt">$3 AND s."updatedAt">$3::timestamptz-interval \'7 days\' AND s."createdAt">$3::timestamptz-interval \'30 days\' ON CONFLICT(auth_session_ref) DO NOTHING',
        [actor.accountId, actor.userId, new Date(actor.now)],
      );
      const mismatch = await client.query(
        'SELECT 1 FROM public.auth_contexts ac JOIN auth.session s ON s.id=ac.auth_session_ref WHERE s."userId"=$1 AND ac.account_id<>$2 LIMIT 1',
        [actor.userId, actor.accountId],
      );
      if (mismatch.rowCount) throw unavailable();
      const rows = (
        await client.query(
          'SELECT ac.id,s.id AS private_id,s."createdAt",s."updatedAt",to_char(s."createdAt" AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') AS cursor_created FROM auth.session s JOIN public.auth_contexts ac ON ac.auth_session_ref=s.id WHERE s."userId"=$1 AND ac.account_id=$2 AND ac.revoked_at IS NULL AND s."expiresAt">$3 AND s."updatedAt">$3::timestamptz-interval \'7 days\' AND s."createdAt">$3::timestamptz-interval \'30 days\' AND ($4::timestamptz IS NULL OR (s."createdAt",ac.id)<($4::timestamptz,$5::uuid)) ORDER BY s."createdAt" DESC,ac.id DESC LIMIT $6',
          [
            actor.userId,
            actor.accountId,
            new Date(actor.now),
            before?.created ?? null,
            before?.id ?? null,
            limit + 1,
          ],
        )
      ).rows;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return response(
        {
          items: page.map((row) => ({
            session_id: row.id,
            is_current: row.private_id === actor.privateId,
            created_at: row.createdAt.toISOString(),
            last_seen_at: row.updatedAt.toISOString(),
            absolute_expires_at: new Date(row.createdAt.getTime() + 30 * DAY).toISOString(),
          })),
          next_cursor:
            rows.length > limit && last
              ? codec.sign(
                  'sessions-cursor-v1',
                  {
                    owner: actor.accountId,
                    created: last.cursor_created,
                    id: last.id,
                    expires: actor.now + CONTEXT_LIFETIME,
                  },
                  actor.accountId,
                )
              : null,
          checked_at: new Date(actor.now).toISOString(),
        },
        [sessionCookie(c.req.raw.headers, actor)],
      );
    });
    if (!result) throw unauthorized();
    return result;
  });
  router.get('/v1/auth/identities', async (c) => {
    const result = await withActor(c.req.raw.headers, async (client, actor) => {
      query(c.req.raw, []);
      return response(await listIdentities(client, actor.userId, actor.now), [
        sessionCookie(c.req.raw.headers, actor),
      ]);
    });
    if (!result) throw unauthorized();
    return result;
  });
  router.post('/v1/auth/sessions/revoke', async (c) => {
    const body = await readJson(c.req.raw);
    if (
      Object.keys(body).length !== 1 ||
      !['CURRENT', 'OTHERS', 'ALL'].includes(body.scope as string)
    )
      throw new ApiError('VALIDATION_ERROR', 422);
    query(c.req.raw, []);
    if (c.req.header('Origin') !== config.origin) throw new ApiError('CSRF_INVALID', 403);
    const revision = c.req.header('X-FesPay-Client-Revision');
    if (
      revision !== undefined &&
      (!/^(0|[1-9][0-9]*)$/.test(revision) || Number(revision) > 2147483647)
    )
      throw new ApiError('VALIDATION_ERROR', 422);
    const result = await withActor(c.req.raw.headers, async (client, actor) => {
      if (
        !validCsrf(
          codec,
          c.req.header('X-CSRF-Token') ?? null,
          'session:' + actor.privateId,
          actor.now,
        )
      )
        throw new ApiError('CSRF_INVALID', 403);
      const scope = body.scope as string;
      const targets = (
        await client.query(
          "SELECT id FROM auth.session WHERE \"userId\"=$1 AND ($2='ALL' OR ($2='CURRENT' AND id=$3) OR ($2='OTHERS' AND id<>$3)) ORDER BY id FOR UPDATE",
          [actor.userId, scope, actor.privateId],
        )
      ).rows.map((row) => row.id);
      await client.query(
        'UPDATE public.auth_contexts SET revoked_at=coalesce(revoked_at,$3),updated_at=$3,version=version+1 WHERE account_id=$1 AND auth_session_ref=ANY($2::text[])',
        [actor.accountId, targets, new Date(actor.now)],
      );
      await client.query('DELETE FROM auth.session WHERE "userId"=$1 AND id=ANY($2::text[])', [
        actor.userId,
        targets,
      ]);
      const current = targets.includes(actor.privateId);
      await client.query(
        "INSERT INTO public.audit(id,actor_account_id,action,target_type,target_id,safe_changes,request_id) VALUES($1,$2,'AUTH_SESSIONS_REVOKED','ACCOUNT',$2,$3,$4)",
        [
          randomUUID(),
          actor.accountId,
          JSON.stringify({
            scope,
            revoked_count: targets.length,
            current_session_revoked: current,
          }),
          requestIds.get(c.req.raw),
        ],
      );
      return response(
        {
          revoked_count: targets.length,
          current_session_revoked: current,
          checked_at: new Date(actor.now).toISOString(),
        },
        current
          ? [
              setCookie(SESSION_COOKIE, '', 0, actor.now),
              setCookie(PREAUTH_COOKIE, '', 0, actor.now),
            ]
          : [sessionCookie(c.req.raw.headers, actor)],
      );
    });
    if (!result) throw unauthorized();
    return result;
  });
  router.route('/', createChargeApi({
    withActor,
    config,
    codec,
    sessionCookie,
    requestId: (request) => requestIds.get(request) ?? randomUUID(),
  }));
  router.route('/', createWalletApi({
    withActor,
    config,
    codec,
    sessionCookie,
    requestId: (request) => requestIds.get(request) ?? randomUUID(),
  }));
  return router;
}
