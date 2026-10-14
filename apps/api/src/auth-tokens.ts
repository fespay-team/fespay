import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './http-input.js';

export const SESSION_COOKIE = '__Host-fespay.session';
export const PREAUTH_COOKIE = '__Host-fespay.preauth';
export const CONTEXT_LIFETIME = 30 * 60000;
export function cookie(headers: Headers, name: string) {
  const matches = (headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + '='));
  if (matches.length > 1) throw new ApiError('VALIDATION_ERROR', 422);
  return matches[0]?.slice(name.length + 1);
}
export function setCookie(name: string, value: string, expires: number, now: number) {
  return (
    name +
    '=' +
    value +
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' +
    Math.max(0, Math.floor((expires - now) / 1000)) +
    '; Expires=' +
    new Date(expires).toUTCString()
  );
}
export function tokenCodec(secret: string) {
  const signature = (purpose: string, payload: string, binding: string) =>
    createHmac('sha256', secret)
      .update(purpose + '\n' + binding + '\n' + payload)
      .digest('base64url');
  return {
    sign(purpose: string, data: unknown, binding = '') {
      const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
      return payload + '.' + signature(purpose, payload, binding);
    },
    read(purpose: string, token: string | undefined, binding = ''): unknown {
      if (!token || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))
        return undefined;
      const [payload, supplied] = token.split('.');
      const expected = signature(purpose, payload, binding);
      if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return undefined;
      try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        return undefined;
      }
    },
  };
}
export function csrf(codec: ReturnType<typeof tokenCodec>, binding: string, expires: number) {
  return codec.sign('csrf-v1', { expires, nonce: randomBytes(32).toString('base64url') }, binding);
}
export function validCsrf(
  codec: ReturnType<typeof tokenCodec>,
  token: string | null,
  binding: string,
  now: number,
) {
  const data = codec.read('csrf-v1', token ?? undefined, binding) as
    { expires?: unknown } | undefined;
  return !!data && typeof data.expires === 'number' && data.expires > now;
}
