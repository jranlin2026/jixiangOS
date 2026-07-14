import assert from 'node:assert/strict';
import { matchExactNamesToUniqueIds } from './exactNameIdentity';

const result = matchExactNamesToUniqueIds(
  [' 吕煜阳 ', 'VIP', '不存在'],
  [
    { id: 'u-1', name: '吕煜阳' },
    { id: 'tag-1', name: 'vip' },
    { id: 'tag-2', name: 'VIP' },
  ],
);
assert.deepEqual(result.matched, ['吕煜阳']);
assert.deepEqual(result.missing, ['不存在']);
assert.deepEqual(result.ambiguous, ['VIP']);
assert.equal(result.idsByName['吕煜阳'], 'u-1');
