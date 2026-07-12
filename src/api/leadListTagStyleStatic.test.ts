import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve('src/pages/Leads/index.tsx'), 'utf8');

assert.match(source, /<ManualTagDisplay scope="lead" ids=\{lead\.manualTagIds\} legacyNames=\{lead\.tags\} \/>/,
  'Lead tags should resolve preset IDs while retaining legacy name snapshots.');

console.log('leadListTagStyleStatic.test.ts passed');
