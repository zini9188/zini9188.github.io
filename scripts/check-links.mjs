import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function checkLinks({ root = 'dist', inputs = ['dist', 'README.md', 'CONTRIBUTING.md', 'docs', 'templates'], stdio = 'inherit' } = {}) {
  return spawnSync(process.env.LYCHEE_BIN || 'lychee', [
    '--offline', '--no-ignore', '--no-progress', '--include-fragments',
    '--index-files', 'index.html', '--root-dir', resolve(root), '--', ...inputs,
  ], { stdio, encoding: 'utf8', timeout: 120_000 });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkLinks();
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
