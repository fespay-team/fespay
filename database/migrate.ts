import { applyDevelopmentMigrations } from '../apps/api/src/migrations.js';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL is required');
try {
  const status = await applyDevelopmentMigrations(url, process.env.FESPAY_APP_PASSWORD ?? '', process.argv.includes('--development'), process.argv.includes('--status'));
  console.table(status);
} catch {
  console.error('開発migrationに失敗しました。接続・対象DB・SQL/checksumを確認してください。秘密や接続URLは表示しません。');
  process.exitCode = 1;
}
