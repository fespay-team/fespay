import { randomBytes } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const mode = args[0];
if (!['local', 'staging'].includes(mode))
  throw new Error('Choose local or staging');
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const port = option('--port', mode === 'local' ? '8443' : '18080');
if (!/^[1-9][0-9]*$/.test(port) || Number(port) > 65535)
  throw new Error('Invalid port');
const project = option('--project', 'fespay-' + mode);
if (!/^[a-z][a-z0-9-]{1,62}$/.test(project))
  throw new Error('Invalid Compose project');
const origin = new URL(
  option(
    '--origin',
    mode === 'local'
      ? `https://localhost:${port}`
      : 'https://fespay-staging.mu-natuki.com',
  ),
);
if (
  origin.protocol !== 'https:' ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
)
  throw new Error('Use an HTTPS origin');
if (mode === 'local' && origin.hostname !== 'localhost')
  throw new Error('Local HTTPS uses localhost');
const file = '.env.docker.' + mode;
if (
  await access(file).then(
    () => true,
    () => false,
  )
)
  throw new Error(
    file + ' already exists; credentials will not be overwritten',
  );
const random = () => randomBytes(32).toString('hex');
let password, hash;
if (mode === 'staging') {
  password = randomBytes(24).toString('base64url');
  const result = spawnSync('caddy', ['hash-password'], {
    input: password + '\n',
    encoding: 'utf8',
  });
  hash = result.stdout?.trim();
  if (
    result.status !== 0 ||
    !/^\$2[aby]\$\d\d\$[A-Za-z0-9./]{53}$/.test(hash ?? '')
  )
    throw new Error('Caddy bcrypt generation failed');
  await mkdir('secrets', { recursive: true, mode: 0o700 });
  await writeFile('secrets/staging-viewer-password.txt', password + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
}
const entries = {
  FESPAY_ENV: mode,
  FESPAY_PROJECT: project,
  FESPAY_DATABASE: mode === 'local' ? 'fespay_dev' : 'fespay_staging',
  APP_ORIGIN: origin.origin,
  FESPAY_SITE_HOST: origin.host,
  FESPAY_HTTPS_PORT: port,
  FESPAY_HTTP_PORT: port,
  POSTGRES_PASSWORD: random(),
  FESPAY_APP_PASSWORD: random(),
  BETTER_AUTH_SECRET: random(),
  ...(mode === 'staging'
    ? { FESPAY_STAGE_USER: 'fespay-team', FESPAY_STAGE_PASSWORD_HASH: hash }
    : {}),
};
await writeFile(
  file,
  Object.entries(entries)
    .map(([key, value]) => `${key}='${value}'`)
    .join('\n') + '\n',
  { flag: 'wx', mode: 0o600 },
);
console.log(
  file + ' を作成しました。URL: ' + origin.origin + '。秘密値は表示しません。',
);
if (mode === 'staging')
  console.log(
    '検証用Basic認証のPWは secrets/staging-viewer-password.txt に保存しました。',
  );
