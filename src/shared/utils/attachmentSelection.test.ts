import assert from 'node:assert/strict';
import { clipboardImageFiles, selectAttachments } from './attachmentSelection';

const image = (name: string, size = 100, lastModified = 1) => (
  new File(['x'.repeat(size)], name, { type: 'image/png', lastModified })
);

const singleOverflow = selectAttachments([], [image('a.png'), image('b.png')], {
  maxCount: 1,
  maxBytes: 10_000,
  accept: ['image/'],
  rejectWholeBatchOnOverflow: true,
});
assert.deepEqual(singleOverflow.accepted, []);
assert.equal(singleOverflow.rejected.length, 2);
assert.equal(singleOverflow.message, '最多上传 1 张，本次选择了 2 张');

const capped = selectAttachments([], Array.from({ length: 9 }, (_, index) => image(`${index}.png`)), {
  maxCount: 8,
  maxBytes: 10_000,
  accept: ['image/'],
  rejectWholeBatchOnOverflow: false,
});
assert.equal(capped.accepted.length, 8);
assert.equal(capped.rejected.length, 1);
assert.equal(capped.message, '最多上传 8 张，已加入 8 张，另有 1 张未加入');

const duplicate = selectAttachments([image('a.png')], [image('a.png'), image('a.png', 100, 2)], {
  maxCount: 8,
  maxBytes: 10_000,
  accept: ['image/'],
  rejectWholeBatchOnOverflow: false,
});
assert.equal(duplicate.duplicates.length, 1);
assert.equal(duplicate.accepted.length, 1);

const invalid = selectAttachments([], [
  new File(['pdf'], 'document.pdf', { type: 'application/pdf' }),
  image('large.png', 101),
], {
  maxCount: 8,
  maxBytes: 100,
  accept: ['image/'],
  rejectWholeBatchOnOverflow: false,
});
assert.equal(invalid.rejected.length, 2);
assert.match(invalid.message || '', /文件类型不支持/);
assert.match(invalid.message || '', /文件不能超过/);

const pastedImage = image('pasted.png');
const clipboard = {
  items: [
    { kind: 'string', type: 'text/plain', getAsFile: () => null },
    { kind: 'file', type: 'image/png', getAsFile: () => pastedImage },
    { kind: 'file', type: 'application/pdf', getAsFile: () => new File(['pdf'], 'a.pdf', { type: 'application/pdf' }) },
  ],
} as unknown as DataTransfer;
assert.deepEqual(clipboardImageFiles(clipboard), [pastedImage]);
