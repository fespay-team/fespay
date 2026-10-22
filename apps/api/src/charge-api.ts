import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { PoolClient } from 'pg';
import { ApiError, readJson } from './http-input.js';
import { validCsrf } from './auth-tokens.js';

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

type WithActor = <T>(
  headers: Headers,
  action: (client: PoolClient, actor: Actor) => Promise<T>,
) => Promise<T | null>;

type ChargeRow = {
  id: string;
  event_id: string;
  account_id: string;
  operator_account_id: string;
  shop_id: string | null;
  amount: string;
  status: string;
  version: string;
  transaction_id: string | null;
  cash_received_confirmed: boolean;
  cash_returned_confirmed: boolean;
  created_at: Date;
  display_name: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^[1-9][0-9]{0,29}$/;
const VERSION = /^[1-9][0-9]*$/;
const KEY = /^[!-~]{1,128}$/;
const badInput = () => new ApiError('VALIDATION_ERROR', 422);
const conflict = (code = 'INVALID_STATE') => new ApiError(code, 409);
const forbidden = () => new ApiError('FORBIDDEN', 403);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashRequest(method: string, eventId: string, operation: string, ids: string[], body: object) {
  return createHash('sha256')
    .update(canonical({ method, event_id_or_global_scope: eventId, operationId: operation, path_resource_ids: ids, validated_body: body }))
    .digest();
}

function dto(row: ChargeRow, eventId: string, checkedAt: Date) {
  return {
    charge_id: row.id,
    event_id: eventId,
    target: {
      account_id: row.account_id,
      display_name: row.display_name,
      // The contract defines this as a non-secret cross-check value. The public
      // account UUID is already present in the same DTO and is stable.
      verification_code: row.account_id,
    },
    assigned_operator_account_id: row.operator_account_id,
    amount: row.amount,
    currency: 'JPY',
    status: row.status,
    ...(row.status === 'SUCCEEDED' ? { transaction_id: row.transaction_id, cash_received_confirmed: true } : {}),
    ...(row.status === 'INVESTIGATING' ? { case_id: (row as ChargeRow & { case_id?: string }).case_id } : {}),
    ...(row.status === 'CANCELLED' && row.cash_received_confirmed
      ? { cash_received_confirmed: true, cash_returned_confirmed: row.cash_returned_confirmed }
      : {}),
    version: row.version,
    created_at: row.created_at.toISOString(),
    checked_at: checkedAt.toISOString(),
  };
}

export function createChargeApi(options: {
  withActor: WithActor;
  config: { origin: string };
  codec: Parameters<typeof validCsrf>[0];
  sessionCookie: (headers: Headers, actor: Actor) => string;
  requestId: (request: Request) => string;
}) {
  const router = new Hono();
  const send = (data: unknown, status = 200, cookie?: string) => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-FesPay-Contract-Revision': '1',
      'X-FesPay-Min-Write-Revision': '1',
    });
    if (cookie) headers.append('Set-Cookie', cookie);
    return new Response(JSON.stringify(data), { status, headers });
  };
  router.onError((error, c) => {
    const failure = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR', 500, true);
    return send({
      code: failure.code,
      message: '要求を完了できません。認証状態または入力を確認してください。',
      request_id: options.requestId(c.req.raw),
      retryable: failure.retryable,
    }, failure.status);
  });
  router.use('/v1/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-FesPay-Contract-Revision', '1');
    c.header('X-FesPay-Min-Write-Revision', '1');
  });

  function pathId(text: string) {
    if (!UUID.test(text)) throw badInput();
    return text.toLowerCase();
  }

  function revision(request: Request, policy: 'CURRENT' | 'RECOVERY' | 'READ') {
    const value = request.headers.get('X-FesPay-Client-Revision');
    if (value !== null && (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > 2147483647))
      throw badInput();
    if (policy === 'CURRENT' && Number(value ?? 0) < 1) throw conflict('CLIENT_UPDATE_REQUIRED');
  }

  function key(request: Request) {
    const value = request.headers.get('Idempotency-Key');
    if (!value || !KEY.test(value)) throw badInput();
    return value;
  }

  function noQuery(request: Request) {
    if (new URL(request.url).search) throw badInput();
  }

  function csrf(request: Request, actor: Actor) {
    if (request.headers.get('Origin') !== options.config.origin || !validCsrf(
      options.codec,
      request.headers.get('X-CSRF-Token'),
      'session:' + actor.privateId,
      actor.now,
    )) throw new ApiError('CSRF_INVALID', 403);
  }

  async function lockCashPermission(client: PoolClient, eventId: string, actor: Actor, shopId?: string | null, requireMfa = true, requireOperational = true) {
    const event = (await client.query(
      'SELECT id,owner_account_id,lifecycle,first_charge_at FROM public.events WHERE id=$1 FOR UPDATE',
      [eventId],
    )).rows[0];
    if (!event) throw new ApiError('RESOURCE_NOT_FOUND', 404);
    const permissions = (await client.query(
      `SELECT g.id,g.shop_id
         FROM public.grants g
         JOIN public.grant_permissions gp ON gp.event_id=g.event_id AND gp.grant_id=g.id AND gp.account_id=g.account_id
        WHERE g.event_id=$1 AND g.account_id=$2 AND g.active AND gp.permission='CHARGE'
          AND ($3::uuid IS NULL OR g.shop_id IS NULL OR g.shop_id=$3)
        ORDER BY g.shop_id NULLS FIRST,g.id FOR UPDATE OF g`,
      [eventId, actor.accountId, shopId ?? null],
    )).rows as { id: string; shop_id: string | null }[];
    const isOwner = event.owner_account_id === actor.accountId;
    if (!isOwner && !permissions.length) throw forbidden();
    if (requireOperational) {
      if (event.lifecycle === 'COMPLETED' || event.lifecycle === 'DRAFT') throw conflict();
      const service = (await client.query('SELECT status FROM public.service_control WHERE singleton=true FOR UPDATE')).rows[0];
      if (!service) throw new ApiError('DEPENDENCY_UNAVAILABLE', 503, true);
      if (service.status !== 'ENABLED') throw conflict();
      const suspensions = (await client.query(
        'SELECT shop_id FROM public.suspensions WHERE event_id=$1 AND active AND (shop_id IS NULL OR shop_id=ANY($2::uuid[])) ORDER BY shop_id NULLS FIRST FOR UPDATE',
        [eventId, [...permissions.map((p) => p.shop_id).filter((id): id is string => id !== null), ...(shopId ? [shopId] : [])]],
      )).rows;
      if (suspensions.length) throw conflict();
    }
    const checkedAt = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
    if (requireMfa && (actor.mfaExpires === null || checkedAt.getTime() >= actor.mfaExpires)) throw new ApiError('MFA_REQUIRED', 403);
    return { event, permissions, isOwner, checkedAt };
  }

  async function currentReadPermission(client: PoolClient, eventId: string, actor: Actor, row: ChargeRow) {
    if (row.account_id === actor.accountId) {
      const member = (await client.query('SELECT 1 FROM public.memberships WHERE event_id=$1 AND account_id=$2', [eventId, actor.accountId])).rowCount;
      if (member) return;
      throw new ApiError('RESOURCE_NOT_FOUND', 404);
    }
    const auth = await lockCashPermission(client, eventId, actor, row.shop_id, false, false);
    if (!auth.isOwner && !auth.permissions.some((p) => p.shop_id === null || p.shop_id === row.shop_id)) throw forbidden();
  }

  async function loadCharge(client: PoolClient, eventId: string, chargeId: string, lock = false) {
    const row = (await client.query(
      `SELECT co.id,co.event_id,co.account_id,co.operator_account_id,co.shop_id,co.amount::text,co.status,
              co.version::text,co.transaction_id,co.cash_received_confirmed,co.cash_returned_confirmed,
              co.created_at,ap.display_name,
              (SELECT cc.id FROM public.cash_cases cc WHERE cc.event_id=co.event_id AND cc.cash_operation_id=co.id ORDER BY cc.created_at DESC LIMIT 1) AS case_id
         FROM public.cash_operations co
         JOIN public.account_profiles ap ON ap.account_id=co.account_id
        WHERE co.event_id=$1 AND co.id=$2 AND co.type='CHARGE'${lock ? ' FOR UPDATE OF co' : ''}`,
      [eventId, chargeId],
    )).rows[0] as ChargeRow | undefined;
    if (!row) throw new ApiError('RESOURCE_NOT_FOUND', 404);
    return row;
  }

  async function accessKey(client: PoolClient, eventId: string, actor: Actor, operation: string, idempotencyKey: string, requestHash: Buffer) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO public.idempotency_keys(id,scope,event_id,actor_account_id,operation,key,request_hash,status)
       VALUES($1,'EVENT',$2,$3,$4,$5,$6,'PENDING') ON CONFLICT DO NOTHING`,
      [id, eventId, actor.accountId, operation, idempotencyKey, requestHash],
    );
    const saved = (await client.query(
      `SELECT id,request_hash,status,result_resource_id,rejection_code
         FROM public.idempotency_keys
        WHERE scope='EVENT' AND event_id=$1 AND actor_account_id=$2 AND operation=$3 AND key=$4 FOR UPDATE`,
      [eventId, actor.accountId, operation, idempotencyKey],
    )).rows[0];
    if (!saved) throw new ApiError('DB_UNAVAILABLE', 503, true);
    if (!Buffer.from(saved.request_hash).equals(requestHash)) throw conflict('IDEMPOTENCY_CONFLICT');
    return saved as { id: string; status: string; result_resource_id: string | null; rejection_code: string | null };
  }

  function assertBody(body: Record<string, unknown>, required: string[], allowed = required) {
    if (Object.keys(body).some((key) => !allowed.includes(key)) || required.some((key) => !(key in body))) throw badInput();
  }

  router.post('/v1/events/:event_id/charges', async (c) => {
    const eventId = pathId(c.req.param('event_id'));
    noQuery(c.req.raw);
    const body = await readJson(c.req.raw);
    assertBody(body, ['identity_token', 'amount']);
    if (typeof body.identity_token !== 'string' || body.identity_token.length < 1 || body.identity_token.length > 1024 ||
        typeof body.amount !== 'string' || !MONEY.test(body.amount)) throw badInput();
    revision(c.req.raw, 'CURRENT');
    const idempotencyKey = key(c.req.raw);
    const result = await options.withActor(c.req.raw.headers, async (client, actor) => {
      csrf(c.req.raw, actor);
      const amount = body.amount as string;
      const canonicalBody = { identity_token: body.identity_token, amount };
      const saved = await accessKey(client, eventId, actor, 'prepareCharge', idempotencyKey,
        hashRequest('POST', eventId, 'prepareCharge', [], canonicalBody));
      if (saved.result_resource_id) {
        const prior = await loadCharge(client, eventId, saved.result_resource_id);
        await currentReadPermission(client, eventId, actor, prior);
        if (saved.status === 'SUCCEEDED') return send(dto(prior, eventId, new Date(actor.now)), 201, options.sessionCookie(c.req.raw.headers, actor));
        if (saved.status === 'REJECTED') throw conflict(saved.rejection_code ?? 'INVALID_STATE');
      }
      const hash = createHash('sha256').update(body.identity_token as string, 'utf8').digest();
      const candidate = (await client.query(
        `SELECT id,event_id,purpose,subject_account_id,resource_id,expires_at,consumed_at,revoked_at
           FROM public.tokens WHERE token_hash=$1`, [hash],
      )).rows[0];
      if (!candidate || candidate.purpose !== 'RECEPTION' || candidate.event_id !== eventId || candidate.resource_id !== null)
        throw conflict('TOKEN_EXPIRED');
      if (candidate.consumed_at || candidate.revoked_at) throw conflict('TOKEN_CONSUMED');
      const auth = await lockCashPermission(client, eventId, actor);
      const settings = (await client.query(
        `SELECT settings->'charge_window' AS charge_window
           FROM public.event_settings WHERE event_id=$1 FOR UPDATE`,
        [eventId],
      )).rows[0];
      const window = settings?.charge_window as { starts_at?: unknown; ends_at?: unknown } | undefined;
      const start = typeof window?.starts_at === 'string' && /Z$/.test(window.starts_at) ? Date.parse(window.starts_at) : NaN;
      const end = typeof window?.ends_at === 'string' && /Z$/.test(window.ends_at) ? Date.parse(window.ends_at) : NaN;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new ApiError('DEPENDENCY_UNAVAILABLE', 503, true);
      if (auth.checkedAt.getTime() < start || auth.checkedAt.getTime() >= end) throw conflict();
      const eventScope = auth.permissions.some((p) => p.shop_id === null);
      const assignedShops = [...new Set(auth.permissions.map((p) => p.shop_id).filter((id): id is string => id !== null))];
      if (!auth.isOwner && !eventScope && assignedShops.length > 1)
        throw conflict('INVALID_STATE');
      const shopId = auth.isOwner || eventScope ? null : (assignedShops[0] ?? null);
      if (shopId) {
        const shop = (await client.query('SELECT status FROM public.shops WHERE event_id=$1 AND id=$2 FOR UPDATE', [eventId, shopId])).rows[0];
        if (!shop || shop.status !== 'OPEN') throw conflict();
      }
      const member = (await client.query(
        `SELECT m.account_id,w.id AS wallet_id,w.version::text AS wallet_version
           FROM public.memberships m JOIN public.wallets w ON w.event_id=m.event_id AND w.account_id=m.account_id
          WHERE m.event_id=$1 AND m.account_id=$2 AND m.status='ACTIVE' FOR UPDATE OF m,w`,
        [eventId, candidate.subject_account_id],
      )).rows[0];
      if (!member) throw new ApiError('RESOURCE_NOT_FOUND', 404);
      const chargeId = randomUUID();
      await client.query(
        `INSERT INTO public.cash_operations(id,event_id,shop_id,account_id,operator_account_id,type,status,amount)
         VALUES($1,$2,$3,$4,$5,'CHARGE','PREPARED',$6)`,
        [chargeId, eventId, shopId, candidate.subject_account_id, actor.accountId, amount],
      );
      const lockedToken = (await client.query(
        'SELECT id,purpose,event_id,subject_account_id,resource_id,expires_at,consumed_at,revoked_at FROM public.tokens WHERE id=$1 FOR UPDATE',
        [candidate.id],
      )).rows[0];
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
      if (!lockedToken || lockedToken.purpose !== 'RECEPTION' || lockedToken.event_id !== eventId ||
          lockedToken.subject_account_id !== candidate.subject_account_id || lockedToken.resource_id !== null ||
          lockedToken.consumed_at || lockedToken.revoked_at || lockedToken.expires_at <= now)
        throw conflict(lockedToken?.consumed_at || lockedToken?.revoked_at ? 'TOKEN_CONSUMED' : 'TOKEN_EXPIRED');
      if (now.getTime() < start || now.getTime() >= end) throw conflict();
      if (actor.mfaExpires === null || now.getTime() >= actor.mfaExpires) throw new ApiError('MFA_REQUIRED', 403);
      const consumed = await client.query(
        'UPDATE public.tokens SET consumed_at=$2,token_hash=NULL,version=version+1,updated_at=$2 WHERE id=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>$2',
        [candidate.id, now],
      );
      if (!consumed.rowCount) throw conflict('TOKEN_CONSUMED');
      await client.query(
        `UPDATE public.idempotency_keys SET status='SUCCEEDED',result_kind='CHARGE',result_resource_id=$2,version=version+1,updated_at=$3 WHERE id=$1`,
        [saved.id, chargeId, now],
      );
      await client.query(
        `INSERT INTO public.audit(id,event_id,shop_id,actor_account_id,action,target_type,target_id,safe_changes,request_id)
         VALUES($1,$2,$3,$4,'CHARGE_PREPARED','CASH_OPERATION',$5,$6,$7)`,
        [randomUUID(), eventId, shopId, actor.accountId, chargeId, JSON.stringify({ amount, status: 'PREPARED' }), options.requestId(c.req.raw)],
      );
      await client.query(
        `INSERT INTO public.outbox(id,event_id,aggregate_type,aggregate_id,aggregate_version,event_type,payload)
         VALUES($1,$2,'CASH_OPERATION',$3,'1','CHARGE_PREPARED',$4)`,
        [randomUUID(), eventId, chargeId, JSON.stringify({ charge_id: chargeId })],
      );
      const row = await loadCharge(client, eventId, chargeId);
      return send(dto(row, eventId, now), 201, options.sessionCookie(c.req.raw.headers, actor));
    });
    if (!result) throw new ApiError('AUTH_REQUIRED', 401);
    return result;
  });

  router.get('/v1/events/:event_id/charges', async (c) => {
    const eventId = pathId(c.req.param('event_id'));
    const params = new URL(c.req.url).searchParams;
    for (const name of params.keys()) if (!['scope', 'status', 'limit', 'cursor'].includes(name) || params.getAll(name).length !== 1) throw badInput();
    const scope = params.get('scope') ?? 'MINE';
    const status = params.get('status');
    const limitText = params.get('limit') ?? '50';
    if (!['MINE', 'ASSIGNED', 'EVENT'].includes(scope) || (status !== null && !['PREPARED', 'SUCCEEDED', 'CANCELLED', 'INVESTIGATING'].includes(status)) || !/^[1-9][0-9]*$/.test(limitText) || Number(limitText) > 100) throw badInput();
    revision(c.req.raw, 'READ');
    const result = await options.withActor(c.req.raw.headers, async (client, actor) => {
      const event = (await client.query('SELECT id,owner_account_id FROM public.events WHERE id=$1', [eventId])).rows[0];
      if (!event) throw new ApiError('RESOURCE_NOT_FOUND', 404);
      let filter: string;
      const values: unknown[] = [eventId];
      if (scope === 'MINE') { filter = 'co.account_id=$2'; values.push(actor.accountId); }
      else if (scope === 'ASSIGNED') { filter = 'co.operator_account_id=$2'; values.push(actor.accountId); }
      else {
        const auth = await lockCashPermission(client, eventId, actor, undefined, false, false);
        if (!auth.isOwner && !auth.permissions.some((p) => p.shop_id === null)) throw forbidden();
        filter = 'TRUE';
      }
      if (scope === 'ASSIGNED') {
        const auth = await lockCashPermission(client, eventId, actor, undefined, false, false);
        if (!auth.isOwner && !auth.permissions.length) throw forbidden();
        const permittedShops = auth.permissions.filter((p) => p.shop_id !== null).map((p) => p.shop_id);
        if (!auth.isOwner && !auth.permissions.some((p) => p.shop_id === null)) {
          if (!permittedShops.length) throw forbidden();
          filter += ` AND co.shop_id=ANY($${values.length + 1}::uuid[])`;
          values.push(permittedShops);
        }
      }
      values.push(status);
      let before: { owner: string; event: string; scope: string; status: string | null; created_at: string; id: string; expires: number } | undefined;
      const cursor = params.get('cursor');
      if (params.has('cursor') && !cursor) throw new ApiError('CURSOR_INVALID', 422);
      if (cursor) {
        const decoded = options.codec.read('charges-cursor-v1', cursor, actor.accountId) as typeof before | undefined;
        if (!decoded || decoded.owner !== actor.accountId || decoded.event !== eventId || decoded.scope !== scope || decoded.status !== status || decoded.expires <= actor.now || !UUID.test(decoded.id) || !Number.isFinite(Date.parse(decoded.created_at))) throw new ApiError('CURSOR_INVALID', 422);
        before = decoded;
      }
      values.push(before?.created_at ?? null, before?.id ?? null, Number(limitText) + 1);
      const rows = (await client.query(
        `SELECT co.id,co.event_id,co.account_id,co.operator_account_id,co.shop_id,co.amount::text,co.status,co.version::text,
                co.transaction_id,co.cash_received_confirmed,co.cash_returned_confirmed,co.created_at,ap.display_name,
                to_char(co.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created
           FROM public.cash_operations co JOIN public.account_profiles ap ON ap.account_id=co.account_id
          WHERE co.event_id=$1 AND co.type='CHARGE' AND ${filter} AND ($${values.length - 3}::text IS NULL OR co.status=$${values.length - 3})
            AND ($${values.length - 2}::timestamptz IS NULL OR (co.created_at,co.id)<($${values.length - 2},$${values.length - 1}::uuid))
          ORDER BY co.created_at DESC,co.id DESC LIMIT $${values.length}`,
        values,
      )).rows as (ChargeRow & { cursor_created: string })[];
      const page = rows.slice(0, Number(limitText));
      const last = page.at(-1);
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
      return send({
        items: page.map((row) => dto(row, eventId, now)),
        next_cursor: rows.length > Number(limitText) && last ? options.codec.sign('charges-cursor-v1', {
          owner: actor.accountId, event: eventId, scope, status, created_at: last.cursor_created, id: last.id, expires: now.getTime() + 30 * 60_000,
        }, actor.accountId) : null,
        checked_at: now.toISOString(),
      }, 200, options.sessionCookie(c.req.raw.headers, actor));
    });
    if (!result) throw new ApiError('AUTH_REQUIRED', 401);
    return result;
  });

  router.get('/v1/events/:event_id/charges/:charge_id', async (c) => {
    const eventId = pathId(c.req.param('event_id'));
    const chargeId = pathId(c.req.param('charge_id'));
    noQuery(c.req.raw);
    revision(c.req.raw, 'READ');
    const result = await options.withActor(c.req.raw.headers, async (client, actor) => {
      const row = await loadCharge(client, eventId, chargeId);
      await currentReadPermission(client, eventId, actor, row);
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
      return send(dto(row, eventId, now), 200, options.sessionCookie(c.req.raw.headers, actor));
    });
    if (!result) throw new ApiError('AUTH_REQUIRED', 401);
    return result;
  });

  router.post('/v1/events/:event_id/charges/:charge_id/complete', async (c) => {
    const eventId = pathId(c.req.param('event_id'));
    const chargeId = pathId(c.req.param('charge_id'));
    noQuery(c.req.raw);
    const body = await readJson(c.req.raw);
    assertBody(body, ['expected_version', 'amount', 'cash_received_confirmed'], ['expected_version', 'amount', 'cash_received_confirmed', 'resolution_case_id']);
    if (typeof body.expected_version !== 'string' || !VERSION.test(body.expected_version) || typeof body.amount !== 'string' || !MONEY.test(body.amount) || body.cash_received_confirmed !== true || (body.resolution_case_id !== undefined && (typeof body.resolution_case_id !== 'string' || !UUID.test(body.resolution_case_id)))) throw badInput();
    revision(c.req.raw, 'RECOVERY');
    const idempotencyKey = key(c.req.raw);
    const result = await options.withActor(c.req.raw.headers, async (client, actor) => {
      csrf(c.req.raw, actor);
      const saved = await accessKey(client, eventId, actor, 'completeCharge', idempotencyKey,
        hashRequest('POST', eventId, 'completeCharge', [chargeId], body));
      let initial = await loadCharge(client, eventId, chargeId);
      await currentReadPermission(client, eventId, actor, initial);
      if (saved.status === 'SUCCEEDED') return send(dto(initial, eventId, new Date(actor.now)), 200, options.sessionCookie(c.req.raw.headers, actor));
      if (saved.status === 'REJECTED') throw conflict(saved.rejection_code ?? 'INVALID_STATE');
      const auth = await lockCashPermission(client, eventId, actor, initial.shop_id);
      if (!auth.isOwner && initial.operator_account_id !== actor.accountId && !auth.permissions.some((p) => p.shop_id === null || p.shop_id === initial.shop_id)) throw forbidden();
      const member = (await client.query(
        `SELECT w.id,w.available_amount::text,w.version::text
           FROM public.memberships m JOIN public.wallets w ON w.event_id=m.event_id AND w.account_id=m.account_id
          WHERE m.event_id=$1 AND m.account_id=$2 AND m.status='ACTIVE' FOR UPDATE OF m,w`,
        [eventId, initial.account_id],
      )).rows[0];
      if (!member) throw conflict();
      initial = await loadCharge(client, eventId, chargeId, true);
      if (!['PREPARED', 'INVESTIGATING'].includes(initial.status) || initial.version !== body.expected_version) throw conflict('VERSION_CONFLICT');
      if (initial.amount !== body.amount) throw conflict('INVALID_STATE');
      if (initial.status === 'PREPARED' && body.resolution_case_id !== undefined) throw conflict('INVALID_STATE');
      if (initial.status === 'INVESTIGATING') {
        if (typeof body.resolution_case_id !== 'string') throw conflict('CASH_FACT_UNRESOLVED');
        const resolution = (await client.query(
          `SELECT id FROM public.cash_cases
            WHERE id=$1 AND event_id=$2 AND cash_operation_id=$3 AND source_type='CHARGE'
              AND status='RESOLVED' AND db_outcome='NOT_COMMITTED' AND cash_fact='RECEIVED'
              AND resolved_at IS NOT NULL AND resolution_reason IS NOT NULL AND evidence_references IS NOT NULL
            FOR UPDATE`,
          [body.resolution_case_id, eventId, chargeId],
        )).rows[0];
        if (!resolution) throw conflict('CASH_FACT_UNRESOLVED');
      }
      if (BigInt(member.available_amount) + BigInt(initial.amount) > 999999999999999999999999999999n) throw conflict('INVALID_STATE');
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
      if (actor.mfaExpires === null || now.getTime() >= actor.mfaExpires) throw new ApiError('MFA_REQUIRED', 403);
      const transactionId = randomUUID();
      await client.query(
        `INSERT INTO public.transactions(id,event_id,type,amount,actor_account_id,idempotency_id,origin_kind,origin_id,occurred_at)
         VALUES($1,$2,'CHARGE',$3,$4,$5,'CASH_OPERATION',$6,$7)`,
        [transactionId, eventId, initial.amount, actor.accountId, saved.id, chargeId, now],
      );
      await client.query('UPDATE public.wallets SET available_amount=available_amount+$2,version=version+1,updated_at=$3 WHERE id=$1', [member.id, initial.amount, now]);
      await client.query(
        `INSERT INTO public.ledger_entries(id,event_id,transaction_id,account_code,wallet_id,amount) VALUES
         ($1,$2,$3,'WALLET_AVAILABLE',$4,$5),($6,$2,$3,'EVENT_CASH',NULL,$7)`,
        [randomUUID(), eventId, transactionId, member.id, initial.amount, randomUUID(), '-' + initial.amount],
      );
      const updated = (await client.query(
        `UPDATE public.cash_operations SET status='SUCCEEDED',transaction_id=$3,cash_received_confirmed=true,version=version+1,updated_at=$4
          WHERE event_id=$1 AND id=$2 AND status=$6 AND version=$5 RETURNING id`,
        [eventId, chargeId, transactionId, now, body.expected_version, initial.status],
      )).rowCount;
      if (!updated) throw conflict('VERSION_CONFLICT');
      await client.query('UPDATE public.events SET first_charge_at=coalesce(first_charge_at,$2),version=version+1,updated_at=$2 WHERE id=$1', [eventId, now]);
      await client.query("UPDATE public.idempotency_keys SET status='SUCCEEDED',result_kind='CHARGE',result_resource_id=$2,version=version+1,updated_at=$3 WHERE id=$1", [saved.id, chargeId, now]);
      await client.query(
        `INSERT INTO public.audit(id,event_id,shop_id,actor_account_id,action,target_type,target_id,safe_changes,request_id)
         VALUES($1,$2,$3,$4,'CHARGE_COMPLETED','CASH_OPERATION',$5,$6,$7)`,
        [randomUUID(), eventId, initial.shop_id, actor.accountId, chargeId, JSON.stringify({ amount: initial.amount, status: 'SUCCEEDED', transaction_id: transactionId }), options.requestId(c.req.raw)],
      );
      await client.query(
        `INSERT INTO public.outbox(id,event_id,aggregate_type,aggregate_id,aggregate_version,event_type,payload)
         VALUES($1,$2,'CASH_OPERATION',$3,$4,'CHARGE_SUCCEEDED',$5)`,
        [randomUUID(), eventId, chargeId, String(BigInt(initial.version) + 1n), JSON.stringify({ charge_id: chargeId, transaction_id: transactionId })],
      );
      const row = await loadCharge(client, eventId, chargeId);
      return send(dto(row, eventId, now), 200, options.sessionCookie(c.req.raw.headers, actor));
    });
    if (!result) throw new ApiError('AUTH_REQUIRED', 401);
    return result;
  });

  router.post('/v1/events/:event_id/charges/:charge_id/cancel', async (c) => {
    const eventId = pathId(c.req.param('event_id'));
    const chargeId = pathId(c.req.param('charge_id'));
    noQuery(c.req.raw);
    const body = await readJson(c.req.raw);
    assertBody(body, ['expected_version', 'cash_not_received_confirmed', 'reason']);
    if (typeof body.expected_version !== 'string' || !VERSION.test(body.expected_version) || body.cash_not_received_confirmed !== true || typeof body.reason !== 'string' || !body.reason.trim() || [...body.reason].length > 1000) throw badInput();
    revision(c.req.raw, 'RECOVERY');
    const idempotencyKey = key(c.req.raw);
    const result = await options.withActor(c.req.raw.headers, async (client, actor) => {
      csrf(c.req.raw, actor);
      const saved = await accessKey(client, eventId, actor, 'cancelUnreceivedCharge', idempotencyKey,
        hashRequest('POST', eventId, 'cancelUnreceivedCharge', [chargeId], body));
      let row = await loadCharge(client, eventId, chargeId);
      await currentReadPermission(client, eventId, actor, row);
      if (saved.status === 'SUCCEEDED') return send(dto(row, eventId, new Date(actor.now)), 200, options.sessionCookie(c.req.raw.headers, actor));
      if (saved.status === 'REJECTED') throw conflict(saved.rejection_code ?? 'INVALID_STATE');
      const auth = await lockCashPermission(client, eventId, actor, row.shop_id, true, false);
      if (!auth.isOwner && row.operator_account_id !== actor.accountId && !auth.permissions.some((p) => p.shop_id === null || p.shop_id === row.shop_id)) throw forbidden();
      row = await loadCharge(client, eventId, chargeId, true);
      if (row.status !== 'PREPARED' || row.version !== body.expected_version) throw conflict('VERSION_CONFLICT');
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
      if (actor.mfaExpires === null || now.getTime() >= actor.mfaExpires) throw new ApiError('MFA_REQUIRED', 403);
      await client.query(
        `UPDATE public.cash_operations SET status='CANCELLED',cash_not_delivered_confirmed=true,reason=$3,version=version+1,updated_at=$4
          WHERE event_id=$1 AND id=$2 AND status='PREPARED' AND version=$5`,
        [eventId, chargeId, body.reason, now, body.expected_version],
      );
      await client.query("UPDATE public.idempotency_keys SET status='SUCCEEDED',result_kind='CHARGE',result_resource_id=$2,version=version+1,updated_at=$3 WHERE id=$1", [saved.id, chargeId, now]);
      await client.query(
        `INSERT INTO public.audit(id,event_id,shop_id,actor_account_id,action,target_type,target_id,reason,safe_changes,request_id)
         VALUES($1,$2,$3,$4,'CHARGE_CANCELLED','CASH_OPERATION',$5,$6,$7,$8)`,
        [randomUUID(), eventId, row.shop_id, actor.accountId, chargeId, body.reason, JSON.stringify({ status: 'CANCELLED', cash_not_received_confirmed: true }), options.requestId(c.req.raw)],
      );
      await client.query(
        `INSERT INTO public.outbox(id,event_id,aggregate_type,aggregate_id,aggregate_version,event_type,payload)
         VALUES($1,$2,'CASH_OPERATION',$3,$4,'CHARGE_CANCELLED',$5)`,
        [randomUUID(), eventId, chargeId, String(BigInt(row.version) + 1n), JSON.stringify({ charge_id: chargeId })],
      );
      const updated = await loadCharge(client, eventId, chargeId);
      return send(dto(updated, eventId, now), 200, options.sessionCookie(c.req.raw.headers, actor));
    });
    if (!result) throw new ApiError('AUTH_REQUIRED', 401);
    return result;
  });

  return router;
}
