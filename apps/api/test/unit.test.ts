import test from 'node:test';
import assert from 'node:assert/strict';
import { guardDevelopmentDatabase, guardDockerDatabase } from '../src/migrations.js';
import { readConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

test('development migration refuses nonlocal, unintended, production and implicit targets', () => {
  const okay = 'postgresql://owner@127.0.0.1/fespay_dev';
  guardDevelopmentDatabase(okay, true);
  for (const url of ['postgresql://owner@example.com/fespay_dev', 'postgresql://owner@127.0.0.1/production', okay+'?host=example.com']) {
    assert.throws(() => guardDevelopmentDatabase(url, true));
  }
  assert.throws(() => guardDevelopmentDatabase(okay, false));
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try { assert.throws(() => guardDevelopmentDatabase(okay, true)); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
test('configuration rejects missing secrets and unsafe production origins', () => {
  assert.throws(() => readConfig({}));
  assert.throws(() => readConfig({ DATABASE_URL: 'unused', BETTER_AUTH_SECRET: 'short' }));
  assert.throws(() => readConfig({ DATABASE_URL: 'unused', BETTER_AUTH_SECRET: 'x'.repeat(32), NODE_ENV: 'production', APP_ORIGIN: 'http://localhost' }));
  assert.throws(() => readConfig({ DATABASE_URL: 'unused', BETTER_AUTH_SECRET: 'x'.repeat(32), APP_ORIGIN: 'https://user:secret@fespay.test' }));
});
test('Docker migration guard restricts environment, owner, namespace and explicit intent', () => {
  const url = 'postgresql://fespay_owner@127.0.0.1:5432/fespay_staging';
  guardDockerDatabase(url, 'staging', true);
  guardDockerDatabase(url.replace('fespay_staging', 'fespay_dev'), 'local', true);
  for (const bad of [
    url.replace('127.0.0.1', 'db'), url.replace('fespay_owner', 'fespay_app'),
    url.replace('fespay_staging', 'production'), url + '?host=remote', url.replace(':5432', ':5433'),
  ]) assert.throws(() => guardDockerDatabase(bad, 'staging', true));
  assert.throws(() => guardDockerDatabase(url, 'production', true));
  assert.throws(() => guardDockerDatabase(url, 'staging', false));
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try { assert.throws(() => guardDockerDatabase(url, 'staging', true)); }
  finally {
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
  }
});
test('readiness rejects a DB outage without reflecting its sensitive error', async () => {
  const app = createApp(async () => { throw new Error('postgresql://owner:secret@internal'); });
  const response = await app.request('/health/ready');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'unavailable' });
});
test('raw authentication and unimplemented business routes are not exposed', async () => {
  const app = createApp(async () => {});
  for (const path of ['/api/auth/sign-up/email', '/v1/auth/sign-up/email', '/v1/events']) {
    assert.equal((await app.request(path, { method: 'POST' })).status, 404);
  }
});
