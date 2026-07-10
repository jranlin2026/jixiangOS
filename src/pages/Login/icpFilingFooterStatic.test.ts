import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve('src/pages/Login/index.tsx'), 'utf8');

assert.match(
  source,
  /href="https:\/\/beian\.miit\.gov\.cn\/"/,
  'The login page should link its ICP filing number to the MIIT filing site.',
);
assert.match(
  source,
  /闽ICP备2026025630号-1/,
  'The login page should display the approved ICP filing number.',
);

console.log('icpFilingFooterStatic.test.ts passed');
