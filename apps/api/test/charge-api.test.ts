import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { createChargeApi } from '../src/charge-api.js';
import { readConfig } from '../src/config.js';
import { applyDevelopmentMigrations } from '../src/migrations.js';
import { csrf, tokenCodec } from '../src/auth-tokens.js';
import { startDatabase } from './database.js';

test('charge preparation, completion and cancellation preserve ledger atomicity and idempotency', { timeout: 120000 }, async (t) => {
  const db = await startDatabase();
  const owner = new Pool({ connectionString: db.adminUrl });
  const pool = new Pool({ connectionString: db.appUrl });
  const config = readConfig({
    DATABASE_URL: db.appUrl,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    APP_ORIGIN: 'https://fespay.test',
  });
  const codec = tokenCodec(config.secret);
  const eventId = randomUUID();
  const eventOwnerId = randomUUID();
  const operatorId = randomUUID();
  const targetId = randomUUID();
  const walletId = randomUUID();
  const grantId = randomUUID();
  const sessionId = 'charge-test-session';
  const operator = { privateId: sessionId, userId: 'operator-user', accountId: operatorId, publicId: randomUUID(), now: Date.now(), created: new Date(), expires: Date.now() + 3600000, absolute: Date.now() + 3600000, account: { account_id: operatorId, display_name: 'Operator', email: 'operator@example.test', email_verified: true, status: 'ACTIVE', version: '1' }, mfaExpires: Date.now() + 3600000, privilegedMfa: null };
  const requestIds = new WeakMap<Request, string>();
  const api = createApp(async () => {}, createChargeApi({
    config,
    codec,
    withActor: async <T>(_headers: Headers, action: (client: import('pg').PoolClient, actor: typeof operator) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await action(client, { ...operator, now: Date.now(), mfaExpires: Date.now() + 3600000 });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
    sessionCookie: () => 'fespay_session=test',
    requestId: (request) => requestIds.get(request) ?? 'charge-test-request',
  }));
  const csrfToken = csrf(codec, 'session:' + sessionId, Date.now() + 3600000);
  const call = async (method: string, path: string, body?: object, extra: Record<string, string> = {}) => {
    const request = new Request(config.origin + path, {
      method,
      headers: {
        origin: config.origin,
        'content-type': 'application/json',
        'X-CSRF-Token': csrfToken,
        ...(body ? { 'Idempotency-Key': 'charge-key-0001', 'X-FesPay-Client-Revision': '1' } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    requestIds.set(request, randomUUID());
    const response = await api.fetch(request);
    return { response, data: await response.json() as Record<string, any> };
  };
  const seedToken = async (expiresAt = new Date(Date.now() + 60000)) => {
    const raw = randomBytes(32).toString('base64url');
    await owner.query(
      `INSERT INTO public.tokens(id,event_id,purpose,subject_account_id,token_hash,expires_at)
       VALUES($1,$2,'RECEPTION',$3,$4,$5)`,
      [randomUUID(), eventId, targetId, createHash('sha256').update(raw).digest(), expiresAt],
    );
    return raw;
  };
  try {
    await applyDevelopmentMigrations(db.adminUrl, db.appPassword, true);
    const now = new Date();
    const eventStart = new Date(now.getTime() - 86400000);
    const eventEnd = new Date(now.getTime() + 86400000);
    await owner.query('INSERT INTO public.accounts(id) VALUES($1),($2),($3)', [operatorId, targetId, eventOwnerId]);
    await owner.query(
      `INSERT INTO public.account_profiles(id,account_id,email,display_name,email_verified_at) VALUES
       ($1,$2,'operator@example.test','Operator',now()),($3,$4,'target@example.test','Target',now())`,
      [randomUUID(), operatorId, randomUUID(), targetId],
    );
    await owner.query(
      'INSERT INTO public.events(id,owner_account_id,name,lifecycle,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6)',
      [eventId, eventOwnerId, 'Charge test', 'RUNNING', eventStart, eventEnd],
    );
    await owner.query(
      'INSERT INTO public.event_policies(id,event_id,policy_version,terms,effective_at,created_by) VALUES($1,$2,1,$3,$4,$5)',
      [randomUUID(), eventId, '{}', eventStart, eventOwnerId],
    );
    await owner.query(
      'INSERT INTO public.event_settings(id,event_id,policy_version,settings) VALUES($1,$2,1,$3)',
      [randomUUID(), eventId, JSON.stringify({ charge_window: { starts_at: new Date(now.getTime() - 3600000).toISOString(), ends_at: new Date(now.getTime() + 3600000).toISOString() } })],
    );
    await owner.query(
      'INSERT INTO public.memberships(id,event_id,account_id,status,accepted_policy_version,joined_at) VALUES($1,$2,$3,$4,1,$5)',
      [randomUUID(), eventId, targetId, 'ACTIVE', eventStart],
    );
    await owner.query('INSERT INTO public.wallets(id,event_id,account_id) VALUES($1,$2,$3)', [walletId, eventId, targetId]);
    await owner.query(
      'INSERT INTO public.grants(id,event_id,account_id,role,active,granted_by) VALUES($1,$2,$3,$4,true,$5)',
      [grantId, eventId, operatorId, 'EVENT_OPERATOR', eventOwnerId],
    );
    await owner.query(
      'INSERT INTO public.grant_permissions(id,event_id,grant_id,account_id,permission) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), eventId, grantId, operatorId, 'CHARGE'],
    );
    await owner.query('INSERT INTO public.service_control(id,status) VALUES($1,$2)', [randomUUID(), 'ENABLED']);

    await t.test('PREPARED consumes the short-lived identity token but does not move the wallet; same-key retry returns one resource', async () => {
      const raw = await seedToken();
      const body = { identity_token: raw, amount: '1500' };
      const first = await call('POST', `/v1/events/${eventId}/charges`, body);
      assert.equal(first.response.status, 201);
      assert.equal(first.data.status, 'PREPARED');
      assert.equal(first.data.amount, '1500');
      assert.equal(first.data.target.display_name, 'Target');
      assert.equal((await owner.query('SELECT available_amount::text FROM public.wallets WHERE id=$1', [walletId])).rows[0].available_amount, '0');
      const retry = await call('POST', `/v1/events/${eventId}/charges`, body);
      assert.equal(retry.response.status, 201);
      assert.equal(retry.data.charge_id, first.data.charge_id);
      assert.equal(Number((await owner.query("SELECT count(*) FROM public.cash_operations WHERE event_id=$1 AND type='CHARGE'", [eventId])).rows[0].count), 1);
      const different = await call('POST', `/v1/events/${eventId}/charges`, { ...body, amount: '1600' });
      assert.equal(different.response.status, 409);
      assert.equal(different.data.code, 'IDEMPOTENCY_CONFLICT');
      const consumedAgain = await call('POST', `/v1/events/${eventId}/charges`, body, { 'Idempotency-Key': 'prepare-other-key' });
      assert.equal(consumedAgain.response.status, 409);
      assert.equal(consumedAgain.data.code, 'TOKEN_CONSUMED');
      assert.ok(!JSON.stringify(first.data).includes(raw));
    });

    await t.test('complete posts wallet, transaction, ledger, audit and outbox atomically and replays without a second credit', async () => {
      const raw = await seedToken();
      const prepared = await call('POST', `/v1/events/${eventId}/charges`, { identity_token: raw, amount: '900' }, { 'Idempotency-Key': 'prepare-key-0002' });
      assert.equal(prepared.response.status, 201);
      const chargeId = prepared.data.charge_id as string;
      const body = { expected_version: prepared.data.version, amount: '900', cash_received_confirmed: true };
      const racing = await Promise.all([
        call('POST', `/v1/events/${eventId}/charges/${chargeId}/complete`, body, { 'Idempotency-Key': 'complete-key-0002' }),
        call('POST', `/v1/events/${eventId}/charges/${chargeId}/complete`, body, { 'Idempotency-Key': 'complete-key-0002' }),
      ]);
      assert.deepEqual(racing.map((item) => item.response.status), [200, 200]);
      const completed = racing[0];
      assert.equal(completed.data.status, 'SUCCEEDED');
      assert.equal((await owner.query('SELECT available_amount::text FROM public.wallets WHERE id=$1', [walletId])).rows[0].available_amount, '900');
      assert.equal(Number((await owner.query('SELECT count(*) FROM public.ledger_entries WHERE transaction_id=$1', [completed.data.transaction_id])).rows[0].count), 2);
      assert.equal(Number((await owner.query("SELECT count(*) FROM public.transactions WHERE origin_kind='CASH_OPERATION' AND origin_id=$1", [chargeId])).rows[0].count), 1);
      assert.equal(Number((await owner.query("SELECT count(*) FROM public.outbox WHERE aggregate_id=$1 AND event_type='CHARGE_SUCCEEDED'", [chargeId])).rows[0].count), 1);
      const retry = await call('POST', `/v1/events/${eventId}/charges/${chargeId}/complete`, body, { 'Idempotency-Key': 'complete-key-0002' });
      assert.equal(retry.response.status, 200);
      assert.equal(retry.data.transaction_id, completed.data.transaction_id);
      assert.equal((await owner.query('SELECT available_amount::text FROM public.wallets WHERE id=$1', [walletId])).rows[0].available_amount, '900');
    });

    await t.test('cancellation requires a PREPARED version and never changes the wallet', async () => {
      const raw = await seedToken();
      const prepared = await call('POST', `/v1/events/${eventId}/charges`, { identity_token: raw, amount: '500' }, { 'Idempotency-Key': 'prepare-key-0003' });
      const cancelled = await call('POST', `/v1/events/${eventId}/charges/${prepared.data.charge_id}/cancel`, {
        expected_version: prepared.data.version,
        cash_not_received_confirmed: true,
        reason: '現金未受領を確認',
      }, { 'Idempotency-Key': 'cancel-key-0003' });
      assert.equal(cancelled.response.status, 200);
      assert.equal(cancelled.data.status, 'CANCELLED');
      assert.equal((await owner.query('SELECT available_amount::text FROM public.wallets WHERE id=$1', [walletId])).rows[0].available_amount, '900');
    });

    await t.test('a ledger failure rolls back the cash operation, wallet, transaction and idempotency row', async () => {
      const raw = await seedToken();
      const prepared = await call('POST', `/v1/events/${eventId}/charges`, { identity_token: raw, amount: '250' }, { 'Idempotency-Key': 'prepare-key-rollback' });
      const chargeId = prepared.data.charge_id as string;
      const body = { expected_version: prepared.data.version, amount: '250', cash_received_confirmed: true };
      await owner.query(`CREATE FUNCTION public.reject_charge_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test ledger failure'; END $$`);
      await owner.query(`CREATE TRIGGER reject_charge_ledger BEFORE INSERT ON public.ledger_entries FOR EACH ROW WHEN (NEW.account_code='EVENT_CASH') EXECUTE FUNCTION public.reject_charge_ledger()`);
      try {
        const failed = await call('POST', `/v1/events/${eventId}/charges/${chargeId}/complete`, body, { 'Idempotency-Key': 'complete-key-rollback' });
        assert.equal(failed.response.status, 500);
        assert.equal((await owner.query('SELECT available_amount::text FROM public.wallets WHERE id=$1', [walletId])).rows[0].available_amount, '900');
        assert.equal((await owner.query('SELECT status FROM public.cash_operations WHERE id=$1', [chargeId])).rows[0].status, 'PREPARED');
        assert.equal(Number((await owner.query("SELECT count(*) FROM public.transactions WHERE origin_id=$1", [chargeId])).rows[0].count), 0);
        assert.equal(Number((await owner.query("SELECT count(*) FROM public.idempotency_keys WHERE event_id=$1 AND operation='completeCharge' AND key='complete-key-rollback'", [eventId])).rows[0].count), 0);
      } finally {
        await owner.query('DROP TRIGGER reject_charge_ledger ON public.ledger_entries');
        await owner.query('DROP FUNCTION public.reject_charge_ledger()');
      }
    });

    await t.test('expired identity tokens and missing current grant fail without creating a charge', async () => {
      const expired = await seedToken(new Date(Date.now() - 1000));
      const result = await call('POST', `/v1/events/${eventId}/charges`, { identity_token: expired, amount: '500' }, { 'Idempotency-Key': 'expired-key-0004' });
      assert.equal(result.response.status, 409);
      assert.equal(result.data.code, 'TOKEN_EXPIRED');
      await owner.query('UPDATE public.grants SET active=false WHERE id=$1', [grantId]);
      const unauthorized = await call('GET', `/v1/events/${eventId}/charges?scope=EVENT`);
      assert.equal(unauthorized.response.status, 403);
      assert.equal(Number((await owner.query("SELECT count(*) FROM public.cash_operations WHERE event_id=$1 AND type='CHARGE'", [eventId])).rows[0].count), 4);
    });
  } finally {
    await pool.end();
    await owner.end();
    await db.stop();
  }
});
