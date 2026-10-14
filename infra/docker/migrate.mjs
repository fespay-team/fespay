import { applyDockerMigrations } from '../../apps/api/dist/migrations.js';
try {
  const rows = await applyDockerMigrations(
    process.env.DATABASE_ADMIN_URL ?? '',
    process.env.FESPAY_APP_PASSWORD ?? '',
    process.env.FESPAY_ENV ?? '',
    process.argv.includes('--isolated-docker'),
    process.argv.includes('--status'),
  );
  console.table(rows);
} catch {
  console.error(
    'Docker migrationに失敗しました。対象・接続・checksumを確認してください。',
  );
  process.exitCode = 1;
}
