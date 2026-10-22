import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Hono } from 'hono';
import { createApp } from '../src/app.js';
import { createChargeApi } from '../src/charge-api.js';
import { createWalletApi } from '../src/wallet-api.js';
import { readConfig } from '../src/config.js';
import { ApiError } from '../src/http-input.js';
import { csrf, tokenCodec } from '../src/auth-tokens.js';

test('charge HTTP validation reuses the shared request, CSRF and revision contracts', async () => {
  const config = readConfig({ DATABASE_URL: 'postgresql://fespay_app:unused@127.0.0.1/fespay', BETTER_AUTH_SECRET: 'c'.repeat(64), APP_ORIGIN: 'https://fespay.test' });
  const codec = tokenCodec(config.secret);
  const accountId = randomUUID();
  const privateId = 'charge-validation-session';
  const actor = {
    privateId,
    userId: 'test-user',
    accountId,
    publicId: randomUUID(),
    now: Date.now(),
    created: new Date(),
    expires: Date.now() + 3600000,
    absolute: Date.now() + 3600000,
    account: { account_id: accountId, display_name: 'Test', email: 'test@example.test', email_verified: true, status: 'ACTIVE', version: '1' },
    mfaExpires: Date.now() + 3600000,
    privilegedMfa: null,
  };
  let actorCalls = 0;
  const requestIds = new WeakMap<Request, string>();
  const routes = new Hono()
    .route('/', createChargeApi({
    config,
    codec,
    withActor: async <T>(_headers: Headers, action: (client: PoolClient, current: typeof actor) => Promise<T>) => {
      actorCalls++;
      const client = { query: async () => { throw new ApiError('DB_UNAVAILABLE', 503, true); } } as unknown as PoolClient;
      return action(client, actor);
    },
    sessionCookie: () => 'fespay_session=test',
    requestId: (request) => requestIds.get(request) ?? 'charge-validation-request',
  }))
    .route('/', createWalletApi({
      config,
      codec,
      withActor: async <T>(_headers: Headers, action: (client: PoolClient, current: typeof actor) => Promise<T>) => {
        actorCalls++;
        const client = { query: async () => { throw new ApiError('DB_UNAVAILABLE', 503, true); } } as unknown as PoolClient;
        return action(client, actor);
      },
      sessionCookie: () => 'fespay_session=test',
      requestId: (request) => requestIds.get(request) ?? 'wallet-validation-request',
    }));
  const api = createApp(async () => {}, routes);
  const eventId = randomUUID();
  const validCsrf = csrf(codec, 'session:' + privateId, Date.now() + 3600000);
  const send = async (method: string, path: string, body?: object, headers: Record<string, string> = {}) => {
    const request = new Request(config.origin + path, {
      method,
      headers: {
        origin: config.origin,
        'content-type': 'application/json',
        ...(body ? { 'Idempotency-Key': 'validation-key', 'X-FesPay-Client-Revision': '1' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    requestIds.set(request, randomUUID());
    const response = await api.fetch(request);
    return { response, data: await response.json() as Record<string, unknown> };
  };

  for (const amount of ['', '0', '01', '-1', 100, '1'.repeat(31)]) {
    const before = actorCalls;
    const result = await send('POST', `/v1/events/${eventId}/charges`, { identity_token: 'secret', amount });
    assert.equal(result.response.status, 422);
    assert.equal(result.data.code, 'VALIDATION_ERROR');
    assert.equal(actorCalls, before);
  }
  const extra = await send('POST', `/v1/events/${eventId}/charges`, { identity_token: 'secret', amount: '1', debug: true });
  assert.equal(extra.response.status, 422);
  assert.equal(extra.data.code, 'VALIDATION_ERROR');
  const oldClient = await send('POST', `/v1/events/${eventId}/charges`, { identity_token: 'secret', amount: '1' }, { 'X-FesPay-Client-Revision': '0' });
  assert.equal(oldClient.response.status, 409);
  assert.equal(oldClient.data.code, 'CLIENT_UPDATE_REQUIRED');
  const noKey = await send('POST', `/v1/events/${eventId}/charges`, { identity_token: 'secret', amount: '1' }, { 'Idempotency-Key': '' });
  assert.equal(noKey.response.status, 422);
  const badCsrf = await send('POST', `/v1/events/${eventId}/charges`, { identity_token: 'secret', amount: '1' }, { 'X-CSRF-Token': 'wrong' });
  assert.equal(badCsrf.response.status, 403);
  assert.equal(badCsrf.data.code, 'CSRF_INVALID');
  const goodCsrf = await send('POST', `/v1/events/${eventId}/charges`, { identity_token: 'secret', amount: '1' }, { 'X-CSRF-Token': validCsrf });
  assert.equal(goodCsrf.response.status, 503);
  assert.equal(goodCsrf.data.code, 'DB_UNAVAILABLE');
  const badQuery = await send('GET', `/v1/events/${eventId}/charges?unknown=1`);
  assert.equal(badQuery.response.status, 422);
  assert.equal(badQuery.data.code, 'VALIDATION_ERROR');
  const badScope = await send('GET', `/v1/events/${eventId}/transactions?scope=SHOP`);
  assert.equal(badScope.response.status, 422);
  assert.equal(badScope.data.code, 'VALIDATION_ERROR');
  const badType = await send('GET', `/v1/events/${eventId}/transactions?type=OTHER`);
  assert.equal(badType.response.status, 422);
  assert.equal(badType.data.code, 'VALIDATION_ERROR');
  const walletOutage = await send('GET', `/v1/events/${eventId}/wallet`);
  assert.equal(walletOutage.response.status, 503);
  assert.equal(walletOutage.data.code, 'DB_UNAVAILABLE');
  assert.ok(!JSON.stringify(walletOutage.data).includes(config.databaseUrl));
});
