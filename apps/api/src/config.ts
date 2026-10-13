export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = env.DATABASE_URL;
  const secret = env.BETTER_AUTH_SECRET;
  if (!databaseUrl || !secret || secret.length < 32) throw new Error('DATABASE_URL and a 32+ character BETTER_AUTH_SECRET are required');
  const origin = new URL(env.APP_ORIGIN ?? 'http://localhost:5173');
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('APP_ORIGIN must be an origin');
  if (env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('Production APP_ORIGIN requires HTTPS');
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Unsupported APP_ORIGIN');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) throw new Error('Both Google credentials are required');
  return { databaseUrl, secret, origin: origin.origin, port, googleClientId: env.GOOGLE_CLIENT_ID, googleClientSecret: env.GOOGLE_CLIENT_SECRET };
}
export type Config = ReturnType<typeof readConfig>;
