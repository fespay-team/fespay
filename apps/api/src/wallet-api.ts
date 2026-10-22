import { Hono } from 'hono';
import type { PoolClient } from 'pg';
import { ApiError } from './http-input.js';
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
  account: { account_id: string; display_name: string; email: string; email_verified: boolean; status: string; version: string };
  mfaExpires: number | null;
  privilegedMfa: Date | null;
};

type WithActor = <T>(headers: Headers, action: (client: PoolClient, actor: Actor) => Promise<T>) => Promise<T | null>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = ['CHARGE', 'PAYMENT', 'TRANSFER', 'CASH_REFUND_HOLD', 'CASH_REFUND_RELEASE', 'CASH_REFUND_PAID', 'PURCHASE_REFUND', 'CHARGE_REVERSAL', 'CASH_REFUND_CORRECTION', 'EXPIRATION'];
const badInput = () => new ApiError('VALIDATION_ERROR', 422);
const notFound = () => new ApiError('RESOURCE_NOT_FOUND', 404);
const forbidden = () => new ApiError('FORBIDDEN', 403);

export function createWalletApi(options: {
  withActor: WithActor;
  config: { origin: string };
  codec: Parameters<typeof validCsrf>[0];
  sessionCookie: (headers: Headers, actor: Actor) => string;
  requestId: (request: Request) => string;
}) {
  const router = new Hono();
  const send = (data: unknown, status = 200, cookie?: string) => {
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-FesPay-Contract-Revision': '1', 'X-FesPay-Min-Write-Revision': '1' });
    if (cookie) headers.append('Set-Cookie', cookie);
    return new Response(JSON.stringify(data), { status, headers });
  };
  router.onError((error, c) => {
    const failure = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR', 500, true);
    return send({ code: failure.code, message: '要求を完了できません。認証状態または入力を確認してください。', request_id: options.requestId(c.req.raw), retryable: failure.retryable }, failure.status);
  });
  router.use('/v1/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-FesPay-Contract-Revision', '1');
    c.header('X-FesPay-Min-Write-Revision', '1');
  });

  function eventId(text: string) {
    if (!UUID.test(text)) throw badInput();
    return text.toLowerCase();
  }
  function checkRevision(request: Request) {
    const value = request.headers.get('X-FesPay-Client-Revision');
    if (value !== null && (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > 2147483647)) throw badInput();
  }
  function noQuery(request: Request) {
    if (new URL(request.url).search) throw badInput();
  }
  function query(request: Request, allowed: string[]) {
    const params = new URL(request.url).searchParams;
    for (const name of params.keys()) if (!allowed.includes(name) || params.getAll(name).length !== 1) throw badInput();
    return params;
  }

  async function reportPermission(client: PoolClient, event: string, actor: Actor, scope: 'SHOP' | 'EVENT', shopId: string | null) {
    const eventRow = (await client.query('SELECT id,owner_account_id FROM public.events WHERE id=$1 FOR UPDATE', [event])).rows[0];
    if (!eventRow) throw notFound();
    if (scope === 'SHOP') {
      const shop = (await client.query('SELECT id FROM public.shops WHERE event_id=$1 AND id=$2', [event, shopId])).rows[0];
      if (!shop) throw notFound();
    }
    if (eventRow.owner_account_id === actor.accountId) return;
    const permissions = (await client.query(
      `SELECT g.id FROM public.grants g
         JOIN public.grant_permissions gp ON gp.event_id=g.event_id AND gp.grant_id=g.id AND gp.account_id=g.account_id
        WHERE g.event_id=$1 AND g.account_id=$2 AND g.active AND gp.permission='READ_REPORT'
          AND (($3='EVENT' AND gp.shop_id IS NULL) OR ($3='SHOP' AND (gp.shop_id IS NULL OR gp.shop_id=$4)))
        ORDER BY g.id FOR UPDATE OF g`,
      [event, actor.accountId, scope, shopId],
    )).rows;
    if (!permissions.length) throw forbidden();
  }

  async function mineMembership(client: PoolClient, event: string, account: string) {
    const row = await client.query('SELECT 1 FROM public.memberships WHERE event_id=$1 AND account_id=$2', [event, account]);
    if (!row.rowCount) throw notFound();
  }

  async function wallet(client: PoolClient, event: string, actor: Actor) {
    const row = (await client.query(
      `SELECT w.id,w.event_id,w.available_amount::text,w.held_amount::text,w.refund_only_amount::text,w.version::text,
              l.available::text AS ledger_available,l.held::text AS ledger_held,l.refund_only::text AS ledger_refund_only,
              clock_timestamp() AS checked_at
         FROM public.wallets w
         JOIN public.memberships m ON m.event_id=w.event_id AND m.account_id=w.account_id
         CROSS JOIN LATERAL (
           SELECT coalesce(sum(le.amount) FILTER(WHERE le.account_code='WALLET_AVAILABLE'),0) AS available,
                  coalesce(sum(le.amount) FILTER(WHERE le.account_code='WALLET_HELD'),0) AS held,
                  coalesce(sum(le.amount) FILTER(WHERE le.account_code='WALLET_REFUND_ONLY'),0) AS refund_only
             FROM public.ledger_entries le WHERE le.event_id=w.event_id AND le.wallet_id=w.id
         ) l
        WHERE w.event_id=$1 AND w.account_id=$2`,
      [event, actor.accountId],
    )).rows[0];
    if (!row) throw notFound();
    if (row.available_amount !== row.ledger_available || row.held_amount !== row.ledger_held || row.refund_only_amount !== row.ledger_refund_only)
      throw new ApiError('DB_UNAVAILABLE', 503, true);
    return {
      wallet_id: row.id,
      event_id: event,
      currency: 'JPY',
      available_amount: row.available_amount,
      held_amount: row.held_amount,
      refund_only_amount: row.refund_only_amount,
      version: row.version,
      checked_at: row.checked_at.toISOString(),
    };
  }

  router.get('/v1/events/:event_id/wallet', async (c) => {
    const event = eventId(c.req.param('event_id'));
    noQuery(c.req.raw);
    checkRevision(c.req.raw);
    const result = await options.withActor(c.req.raw.headers, async (client, actor) => send(await wallet(client, event, actor), 200, options.sessionCookie(c.req.raw.headers, actor)));
    if (!result) throw new ApiError('AUTH_REQUIRED', 401);
    return result;
  });
  router.get('/v1/events/:event_id/wallet/summary', async (c) => {
    const event = eventId(c.req.param('event_id'));
    noQuery(c.req.raw);
    checkRevision(c.req.raw);
    const result = await options.withActor(c.req.raw.headers, async (client, actor) => send(await wallet(client, event, actor), 200, options.sessionCookie(c.req.raw.headers, actor)));
    if (!result) throw new ApiError('AUTH_REQUIRED', 401);
    return result;
  });

  async function transactionPage(client: PoolClient, actor: Actor, event: string, request: Request, mode: 'MINE' | 'ANY') {
    const params = query(request, mode === 'MINE' ? ['limit', 'cursor', 'start', 'end'] : ['limit', 'cursor', 'scope', 'shop_id', 'start', 'end', 'type']);
    const rawScope = mode === 'MINE' ? 'MINE' : params.get('scope') ?? 'MINE';
    if (!['MINE', 'SHOP', 'EVENT'].includes(rawScope)) throw badInput();
    const scope = rawScope as 'MINE' | 'SHOP' | 'EVENT';
    const rawShop = params.get('shop_id');
    if ((scope === 'SHOP') !== (rawShop !== null)) throw badInput();
    const shopId = rawShop === null ? null : eventId(rawShop);
    const rawType = params.get('type');
    if (rawType !== null && !TYPES.includes(rawType)) throw badInput();
    const rawStart = params.get('start');
    const rawEnd = params.get('end');
    const parseTime = (value: string | null) => {
      if (value === null) return null;
      if (!/Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw badInput();
      return value;
    };
    const start = parseTime(rawStart);
    const end = parseTime(rawEnd);
    if (start && end && Date.parse(start) >= Date.parse(end)) throw badInput();
    const limitText = params.get('limit') ?? '50';
    if (!/^[1-9][0-9]*$/.test(limitText) || Number(limitText) > 100) throw badInput();
    const limit = Number(limitText);
    const eventRow = (await client.query('SELECT id FROM public.events WHERE id=$1', [event])).rows[0];
    if (!eventRow) throw notFound();
    if (scope === 'MINE') await mineMembership(client, eventRow.id, actor.accountId);
    else await reportPermission(client, eventRow.id, actor, scope, shopId);
    const cursorCheckedAt = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
    const cursorText = params.get('cursor');
    let before: { owner: string; event: string; scope: string; shop: string | null; start: string | null; end: string | null; type: string | null; occurred_at: string; id: string; expires: number } | undefined;
    if (params.has('cursor')) {
      if (!cursorText) throw new ApiError('CURSOR_INVALID', 422);
      before = options.codec.read('transactions-cursor-v1', cursorText, actor.accountId) as typeof before | undefined;
      if (!before || before.owner !== actor.accountId || before.event !== eventRow.id || before.scope !== scope || before.shop !== shopId || before.start !== start || before.end !== end || before.type !== rawType || before.expires <= cursorCheckedAt.getTime() || !UUID.test(before.id) || !Number.isFinite(Date.parse(before.occurred_at))) throw new ApiError('CURSOR_INVALID', 422);
    }
    const rows = (await client.query(
      `SELECT t.id,t.event_id,t.type,t.status,t.amount::text,t.source_transaction_id,
              to_char(t.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,
              to_char(t.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_occurred_at
         FROM public.transactions t
        WHERE t.event_id=$1
          AND ($2='MINE' AND EXISTS(SELECT 1 FROM public.ledger_entries le JOIN public.wallets w ON w.event_id=le.event_id AND w.id=le.wallet_id WHERE le.event_id=t.event_id AND le.transaction_id=t.id AND w.account_id=$3)
            OR $2='SHOP' AND (EXISTS(SELECT 1 FROM public.ledger_entries le WHERE le.event_id=t.event_id AND le.transaction_id=t.id AND le.shop_id=$4)
              OR EXISTS(SELECT 1 FROM public.cash_operations co WHERE co.event_id=t.event_id AND co.transaction_id=t.id AND co.shop_id=$4))
            OR $2='EVENT')
          AND ($5::text IS NULL OR t.type=$5)
          AND ($6::timestamptz IS NULL OR t.occurred_at >= $6)
          AND ($7::timestamptz IS NULL OR t.occurred_at < $7)
          AND ($8::timestamptz IS NULL OR (t.occurred_at,t.id)<($8,$9::uuid))
        ORDER BY t.occurred_at DESC,t.id DESC LIMIT $10`,
      [eventRow.id, scope, actor.accountId, shopId, rawType, start, end, before?.occurred_at ?? null, before?.id ?? null, limit + 1],
    )).rows as { id: string; event_id: string; type: string; status: string; amount: string; source_transaction_id: string | null; occurred_at: string; cursor_occurred_at: string }[];
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const checked = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
    const items = page.map((row) => ({
      transaction_id: row.id,
      event_id: row.event_id,
      type: row.type,
      status: row.status,
      amount: row.amount,
      currency: 'JPY',
      occurred_at: row.occurred_at,
      ...(row.source_transaction_id ? { source_transaction_id: row.source_transaction_id } : {}),
    }));
    const next = rows.length > limit && last ? options.codec.sign('transactions-cursor-v1', {
      owner: actor.accountId, event: eventRow.id, scope, shop: shopId, start, end, type: rawType,
      occurred_at: last.cursor_occurred_at, id: last.id, expires: checked.getTime() + 30 * 60_000,
    }, actor.accountId) : null;
    return { items, next_cursor: next, checked_at: checked.toISOString() };
  }

  router.get('/v1/events/:event_id/transactions', async (c) => {
    const event = eventId(c.req.param('event_id'));
    checkRevision(c.req.raw);
    const result = await options.withActor(c.req.raw.headers, async (client, actor) => send(await transactionPage(client, actor, event, c.req.raw, 'ANY'), 200, options.sessionCookie(c.req.raw.headers, actor)));
    if (!result) throw new ApiError('AUTH_REQUIRED', 401);
    return result;
  });
  router.get('/v1/events/:event_id/wallet/activity', async (c) => {
    const event = eventId(c.req.param('event_id'));
    checkRevision(c.req.raw);
    const result = await options.withActor(c.req.raw.headers, async (client, actor) => send(await transactionPage(client, actor, event, c.req.raw, 'MINE'), 200, options.sessionCookie(c.req.raw.headers, actor)));
    if (!result) throw new ApiError('AUTH_REQUIRED', 401);
    return result;
  });

  async function transactionVisible(client: PoolClient, actor: Actor, event: string, transaction: string) {
    const mine = await client.query(
      `SELECT 1 FROM public.ledger_entries le JOIN public.wallets w ON w.event_id=le.event_id AND w.id=le.wallet_id
        WHERE le.event_id=$1 AND le.transaction_id=$2 AND w.account_id=$3 LIMIT 1`,
      [event, transaction, actor.accountId],
    );
    if (mine.rowCount) return true;
    const shops = (await client.query(
      `SELECT shop_id FROM public.ledger_entries WHERE event_id=$1 AND transaction_id=$2 AND shop_id IS NOT NULL
       UNION SELECT shop_id FROM public.cash_operations WHERE event_id=$1 AND transaction_id=$2 AND shop_id IS NOT NULL`,
      [event, transaction],
    )).rows.map((row) => row.shop_id as string);
    if (!shops.length) {
      await reportPermission(client, event, actor, 'EVENT', null);
      return true;
    }
    for (const shop of shops) await reportPermission(client, event, actor, 'SHOP', shop);
    return true;
  }

  router.get('/v1/events/:event_id/transactions/:transaction_id', async (c) => {
    const event = eventId(c.req.param('event_id'));
    const transactionId = eventId(c.req.param('transaction_id'));
    noQuery(c.req.raw);
    checkRevision(c.req.raw);
    const result = await options.withActor(c.req.raw.headers, async (client, actor) => {
      const row = (await client.query(
        `SELECT id,event_id,type,status,amount::text,source_transaction_id,
                to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at
           FROM public.transactions WHERE event_id=$1 AND id=$2`,
        [event, transactionId],
      )).rows[0];
      if (!row) throw notFound();
      if (!await transactionVisible(client, actor, event, transactionId)) throw notFound();
      return send({
        transaction_id: row.id, event_id: row.event_id, type: row.type, status: row.status,
        amount: row.amount, currency: 'JPY', occurred_at: row.occurred_at,
        ...(row.source_transaction_id ? { source_transaction_id: row.source_transaction_id } : {}),
      }, 200, options.sessionCookie(c.req.raw.headers, actor));
    });
    if (!result) throw new ApiError('AUTH_REQUIRED', 401);
    return result;
  });

  return router;
}
