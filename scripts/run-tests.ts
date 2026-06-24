import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const projectRoot = process.cwd();
const testRoots = ['src/api', 'server'];

const collectTests = (dir: string): string[] => {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return collectTests(path);
    return entry.endsWith('.test.ts') ? [path] : [];
  });
};

const tests = testRoots
  .flatMap((root) => collectTests(join(projectRoot, root)))
  .sort((a, b) => a.localeCompare(b));

for (const testFile of tests) {
  const displayName = relative(projectRoot, testFile);
  console.log(`\n> ${displayName}`);
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', testFile], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\n${tests.length} test files passed.`);
