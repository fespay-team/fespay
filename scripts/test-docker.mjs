import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import https from 'node:https';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(resolve(root, '.tmp'), { recursive: true });
const tmp = await mkdtemp(resolve(root, '.tmp/docker-smoke-'));
const run = async (args) => {
  try {
    return (
      await exec('docker', args, { cwd: root, maxBuffer: 4 * 1024 * 1024 })
    ).stdout;
  } catch (error) {
    throw new Error('Docker operation failed: ' + args.slice(0, 2).join(' '), {
      cause: new Error(error.stderr?.slice(-1500) ?? 'command failed'),
    });
  }
};
const port = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const p = server.address().port;
      server.close(() => resolve(p));
    });
  });
const request = async (url, options = {}, ca) => {
  if (!ca) {
    const res = await fetch(url, options);
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: await res.text(),
    };
  }
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: options.method ?? 'GET', headers: options.headers, ca },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body }),
        );
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
};
const projects = [];
try {
  await run([
    'build',
    '--quiet',
    '-f',
    'infra/docker/Dockerfile.setup',
    '-t',
    'fespay-setup:local',
    '.',
  ]);
  for (const mode of ['local', 'staging']) {
    const project = 'fespay-smoke-' + mode + '-' + randomUUID().slice(0, 8);
    const published = await port();
    await run([
      'run',
      '--rm',
      '-v',
      tmp + ':/workspace',
      'fespay-setup:local',
      mode,
      '--project',
      project,
      '--port',
      String(published),
    ]);
    const envfile = resolve(tmp, '.env.docker.' + mode);
    const originalEnv = await readFile(envfile, 'utf8');
    const env = parseEnv(originalEnv);
    await assert.rejects(() =>
      run([
        'run',
        '--rm',
        '-v',
        tmp + ':/workspace',
        'fespay-setup:local',
        mode,
      ]),
    );
    assert.ok(
      (await readFile(envfile, 'utf8')) === originalEnv,
      'Existing credentials must be retained',
    );
    const base = [
      'compose',
      '--project-directory',
      root,
      '--env-file',
      envfile,
      '-f',
      'compose.docker.yaml',
      '-f',
      mode === 'local' ? 'compose.local.yaml' : 'compose.tunnel.yaml',
    ];
    projects.push(base);
    const compose = async (...args) => run([...base, ...args]);
    const cfg = JSON.parse(await compose('config', '--format', 'json'));
    assert.ok(
      !cfg.services.db.ports?.length && !cfg.services.api.ports?.length,
    );
    assert.equal(cfg.services.gateway.ports[0].host_ip, '127.0.0.1');
    assert.ok(!('DATABASE_ADMIN_URL' in cfg.services.api.environment));
    assert.ok(!('POSTGRES_PASSWORD' in cfg.services.api.environment));
    await compose('build', 'api', 'web', 'migrate');
    await compose('up', '-d', '--wait', 'db');
    await compose('run', '--rm', 'migrate');
    await compose('run', '--rm', 'migrate');
    try {
      await compose('up', '-d', '--wait', 'api', 'web', 'gateway');
    } catch (error) {
      console.error(await compose('logs', '--tail', '30', 'web'));
      throw error;
    }
    const caPath = resolve(tmp, 'local-root.crt');
    let ca;
    if (mode === 'local') {
      for (let i = 0; i < 20; i++) {
        try {
          await compose(
            'cp',
            'gateway:/data/caddy/pki/authorities/local/root.crt',
            caPath,
          );
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      ca = await readFile(caPath);
    }
    const origin =
      (mode === 'local' ? 'https' : 'http') + '://localhost:' + published;
    const headers =
      mode === 'staging'
        ? {
            authorization:
              'Basic ' +
              Buffer.from(
                env.FESPAY_STAGE_USER +
                  ':' +
                  (
                    await readFile(
                      resolve(tmp, 'secrets/staging-viewer-password.txt'),
                      'utf8',
                    )
                  ).trim(),
              ).toString('base64'),
          }
        : {};
    if (mode === 'staging')
      assert.equal((await request(origin + '/health/ready')).status, 401);
    for (const path of ['/', '/health/live', '/health/ready'])
      assert.equal((await request(origin + path, { headers }, ca)).status, 200);
    const page = await request(origin + '/', { headers }, ca);
    assert.match(page.body, /<div id="root">/);
    const context = await request(origin + '/v1/auth/context', { headers }, ca);
    assert.equal(context.status, 200);
    assert.equal(JSON.parse(context.body).authentication_stage, 'ANONYMOUS');
    assert.equal(context.headers['cache-control'], 'no-store');
    assert.equal(context.headers['x-fespay-contract-revision'], '1');
    const cookie = String(context.headers['set-cookie']);
    for (const attr of [
      '__Host-fespay.preauth=',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
    ])
      assert.ok(cookie.includes(attr));
    assert.equal(
      (await request(origin + '/v1/auth/identities', { headers }, ca)).status,
      401,
    );
    assert.equal(
      (
        await request(
          origin + '/v1/auth/sessions/revoke',
          {
            method: 'POST',
            headers: {
              ...headers,
              'content-type': 'application/json',
              origin: 'https://foreign.test',
            },
            body: '{"scope":"ALL"}',
          },
          ca,
        )
      ).status,
      403,
    );
    const count = await compose(
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'fespay_owner',
      '-d',
      env.FESPAY_DATABASE,
      '-Atc',
      'SELECT count(*) FROM fespay_meta.migrations',
    );
    assert.equal(count.trim(), '3');
    await compose('restart', 'api');
    await compose('up', '-d', '--wait', 'api', 'gateway');
    assert.equal(
      (await request(origin + '/health/ready', { headers }, ca)).status,
      200,
    );
    console.log(
      mode +
        ': compose isolation, migrations/repeat, frontend, readiness, CSRF/Cookie, restart passed',
    );
  }
} finally {
  for (const args of projects.reverse()) {
    // Only fresh random test projects created above, never user env/volumes.
    await run([...args, 'down', '--volumes', '--remove-orphans']).catch(
      () => {},
    );
  }
  await rm(tmp, { recursive: true, force: true });
}
