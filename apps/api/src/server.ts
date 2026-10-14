import { serve } from '@hono/node-server';
import { Pool } from 'pg';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createAuth } from './auth.js';
import { createSessionApi } from './session-api.js';

const config = readConfig();
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});
pool.on('error', () => {
  console.error('Database idle connection failed');
});
const auth = createAuth(config, pool);
const app = createApp(
  async () => {
    await pool.query('SELECT id FROM public.accounts LIMIT 0; SELECT id FROM auth."user" LIMIT 0;');
  },
  createSessionApi(config, auth, pool),
);
const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port });
console.log(`FesPay API listening on port ${config.port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 5000);
    deadline.unref();
    server.close(() => {
      void pool.end().then(() => {
        clearTimeout(deadline);
        process.exit(0);
      });
    });
  });
}
