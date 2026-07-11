import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve('src/pages/Leads/index.tsx'), 'utf8');

assert.match(source, /\{\s*id: 'tags',\s*label: '标签',\s*render: \(lead\) => \([\s\S]*?<Box sx=\{\{ display: 'flex', gap: 0\.5, flexWrap: 'wrap' \}\}>/,
  'Lead tags should use the same wrapping container as customer tags.');
assert.match(source, /lead\.tags\?\.length \? lead\.tags\.map\(\(tag\) => \(/,
  'Lead tags should render each tag independently.');
assert.match(source, /<Chip key=\{tag\} label=\{tag\} size="small" variant="outlined" sx=\{\{ height: 22 \}\} \/>/,
  'Each lead tag should use the customer-list outlined chip style.');

console.log('leadListTagStyleStatic.test.ts passed');
