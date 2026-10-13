import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const admin = randomBytes(32).toString('hex');
const app = randomBytes(32).toString('hex');
const secret = randomBytes(32).toString('hex');
await writeFile('.env', [
  'NODE_ENV=development', 'PORT=3000', 'APP_ORIGIN=http://localhost:5173',
  `POSTGRES_PASSWORD=${admin}`, `FESPAY_APP_PASSWORD=${app}`,
  `DATABASE_ADMIN_URL=postgresql://fespay_owner:${admin}@127.0.0.1:54329/fespay_dev`,
  `DATABASE_URL=postgresql://fespay_app:${app}@127.0.0.1:54329/fespay_dev`,
  `BETTER_AUTH_SECRET=${secret}`, '',
].join('\n'), { flag: 'wx', mode: 0o600 });
console.log('開発用.envを作成しました。秘密の値は表示しません。');
