import { betterAuth } from 'better-auth';
import { randomUUID } from 'node:crypto';
import { twoFactor } from 'better-auth/plugins';
import { PostgresDialect } from 'kysely';
import type { Pool } from 'pg';
import type { Config } from './config.js';

// Internal provider. Only FesPay adapters mount public contracts.
export function createAuth(
  config: Config,
  pool: Pool,
  deliverVerificationEmail?: (message: { email: string; url: string }) => Promise<void>,
) {
  return betterAuth({
    appName: 'FesPay',
    baseURL: config.origin,
    secret: config.secret,
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth' },
    trustedOrigins: [config.origin],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 15,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 86400,
      sendVerificationEmail: async ({ user, url }) => {
        if (!deliverVerificationEmail) throw new Error('Verification delivery is not configured');
        await deliverVerificationEmail({ email: user.email, url });
      },
    },
    account: {
      accountLinking: { enabled: true, disableImplicitLinking: true },
      additionalFields: {
        fespayIdentityId: {
          type: 'string',
          required: true,
          input: false,
          returned: false,
          unique: true,
          defaultValue: () => randomUUID(),
        },
      },
    },
    session: { expiresIn: 7 * 86400, cookieCache: { enabled: false } },
    advanced: {
      // 1.7.7 prepends __Secure- even to a custom __Host- name. Disable
      // automatic naming, while explicitly keeping every cookie Secure.
      useSecureCookies: false,
      defaultCookieAttributes: { secure: true, httpOnly: true, sameSite: 'lax', path: '/' },
      cookies: {
        session_token: {
          name: '__Host-fespay.session',
          attributes: { secure: true, httpOnly: true, sameSite: 'lax', path: '/' },
        },
      },
    },
    socialProviders:
      config.googleClientId && config.googleClientSecret
        ? {
            google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret },
          }
        : {},
    plugins: [twoFactor({ issuer: 'FesPay', allowPasswordless: true })],
  });
}
