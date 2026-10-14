import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const apiEnv = { ...process.env, ...parseEnv(await readFile('.env', 'utf8')) };
for (const key of ['DATABASE_ADMIN_URL', 'POSTGRES_PASSWORD', 'FESPAY_APP_PASSWORD']) delete apiEnv[key];
const webEnv = { ...process.env };
for (const key of ['DATABASE_ADMIN_URL', 'DATABASE_URL', 'POSTGRES_PASSWORD', 'FESPAY_APP_PASSWORD', 'BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_SECRET']) delete webEnv[key];
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/server.ts'], { env: apiEnv, stdio: 'inherit' }),
  spawn(process.execPath, ['../../node_modules/vite/bin/vite.js'], { cwd: 'apps/web', env: webEnv, stdio: 'inherit' }),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', code => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
