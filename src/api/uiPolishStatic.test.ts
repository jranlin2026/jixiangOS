import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const projectRoot = process.cwd();
const scanRoots = ['src/pages'];
const nativeDialogPattern = /window\.(alert|confirm)\s*\(/;
const expensivePageSizePattern = /pageSize:\s*1000/;

const collectFiles = (dir: string): string[] => {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return collectFiles(path);
    return /\.(tsx|ts)$/.test(entry) ? [path] : [];
  });
};

const files = scanRoots.flatMap((root) => collectFiles(join(projectRoot, root)));
const scannedFiles = files
  .map((file) => ({
    file: relative(projectRoot, file),
    content: readFileSync(file, 'utf8'),
  }));

const offenders = scannedFiles
  .filter(({ content }) => nativeDialogPattern.test(content))
  .map(({ file }) => file);

assert.deepEqual(offenders, [], `Native browser dialogs must use app-style dialogs instead: ${offenders.join(', ')}`);

const expensiveFetchOffenders = scannedFiles
  .filter(({ content }) => expensivePageSizePattern.test(content))
  .map(({ file }) => file);

assert.deepEqual(expensiveFetchOffenders, [], `Page components should not fetch 1000-row batches in the UI path: ${expensiveFetchOffenders.join(', ')}`);
