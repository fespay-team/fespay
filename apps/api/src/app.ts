import { Hono } from 'hono';

export function createApp(checkDatabase: () => Promise<void>, sessionApi?: Hono) {
  const app = new Hono();
  app.get('/health/live', (c) => c.json({ status: 'ok' }));
  app.get('/health/ready', async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      await checkDatabase();
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'unavailable' }, 503);
    }
  });
  if (sessionApi) app.route('/', sessionApi);
  // Raw Better Auth routes and unimplemented business routes stay private.
  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  return app;
}
