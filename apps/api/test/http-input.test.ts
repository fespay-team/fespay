import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, readJson } from '../src/http-input.js';
import { cookie, csrf, tokenCodec, validCsrf } from '../src/auth-tokens.js';

const request = (body: string | Uint8Array, headers: Record<string, string> = {}) =>
  new Request('https://fespay.test/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : new Uint8Array(body),
  });
const rejects = async (body: string | Uint8Array, code: string, status: number, headers = {}) => {
  await assert.rejects(
    readJson(request(body, headers)),
    (error) => error instanceof ApiError && error.code === code && error.status === status,
  );
};
test('JSON syntax rejects duplicate decoded keys, invalid UTF-8, lone surrogates and nonfinite numbers', async () => {
  for (const body of [
    '{"scope":"ALL","scope":"CURRENT"}',
    '{"scope":1,"\\u0073cope":2}',
    '{"s":"\\ud800"}',
    '{"n":1e400}',
    '{}{}',
    '{"a":01}',
    '\ufeff{}',
  ]) {
    await rejects(body, 'MALFORMED_REQUEST', 400);
  }
  await rejects(new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125]), 'MALFORMED_REQUEST', 400);
  assert.deepEqual(await readJson(request('{"name":"\\ud83d\\ude00","nested":{"name":"ok"}}')), {
    name: '😀',
    nested: { name: 'ok' },
  });
});
test('JSON transport distinguishes syntax and shape, media type and stream failures', async () => {
  for (const body of ['', 'null', '[]', 'true', '1']) await rejects(body, 'VALIDATION_ERROR', 422);
  for (const headers of [
    { 'content-type': 'text/plain' },
    { 'content-type': 'application/json; charset=shift_jis' },
    { 'content-encoding': 'gzip' },
  ]) {
    await rejects('{}', 'UNSUPPORTED_MEDIA_TYPE', 415, headers);
  }
  assert.deepEqual(
    await readJson(
      request('{}', {
        'content-type': 'Application/JSON; charset="UTF-8"',
        'content-encoding': 'Identity',
      }),
    ),
    {},
  );
  const stream = new ReadableStream({
    pull(controller) {
      controller.error(new Error('transport details'));
    },
  });
  const failed = new Request('https://fespay.test/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(
    readJson(failed),
    (error) => error instanceof ApiError && error.code === 'MALFORMED_REQUEST',
  );
});
test('body limits count actual bytes, container depth and values at both boundaries', async () => {
  const exact = '{"s":"' + 'x'.repeat(262144 - 8) + '"}';
  assert.equal(Buffer.byteLength(exact), 262144);
  assert.equal((await readJson(request(exact))).s?.toString().length, 262144 - 8);
  await rejects(exact + ' ', 'PAYLOAD_TOO_LARGE', 413, { 'content-length': '1' });
  assert.ok(await readJson(request('{"a":' + '['.repeat(31) + '0' + ']'.repeat(31) + '}')));
  await rejects('{"a":' + '['.repeat(32) + '0' + ']'.repeat(32) + '}', 'PAYLOAD_TOO_LARGE', 413);
  assert.ok(await readJson(request('{"a":[' + Array(9998).fill('0').join(',') + ']}')));
  await rejects('{"a":[' + Array(9999).fill('0').join(',') + ']}', 'PAYLOAD_TOO_LARGE', 413);
});
test('signed tokens cannot cross purpose, session or account bindings; duplicate cookie is ambiguous', () => {
  const codec = tokenCodec('fixture'.repeat(8));
  const now = Date.now();
  const token = csrf(codec, 'session:a', now + 1000);
  assert.ok(validCsrf(codec, token, 'session:a', now));
  assert.ok(!validCsrf(codec, token, 'session:b', now));
  assert.ok(!validCsrf(codec, token, 'session:a', now + 1000));
  assert.equal(codec.read('preauth-v1', token, 'session:a'), undefined);
  assert.equal(codec.read('csrf-v1', token.slice(0, -1) + '!', 'session:a'), undefined);
  assert.throws(() => cookie(new Headers({ cookie: 'x=one; x=two' }), 'x'), ApiError);
});
