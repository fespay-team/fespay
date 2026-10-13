import { spawnSync } from 'node:child_process';

for (const file of [
  'docs/design/api/validation/validate_contract.py',
  'docs/design/api/validation/validate_wire.py',
  'docs/design/api/validation/validate_lint.py',
  'docs/design/database/validation/check_contract.py',
]) {
  const result = spawnSync(process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), [file], { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(1);
}
