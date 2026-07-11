import assert from 'node:assert/strict';
import { isMarkdownFile } from './utils';

assert.equal(isMarkdownFile({ name: '销售手册.md', type: '' }), true);
assert.equal(isMarkdownFile({ name: 'policy.MD', type: 'text/plain' }), true);
assert.equal(isMarkdownFile({ name: 'notes.txt', type: 'text/markdown' }), false);
assert.equal(isMarkdownFile({ name: '伪装.md.exe', type: 'text/markdown' }), false);
