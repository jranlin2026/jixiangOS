import assert from 'node:assert/strict';
import type { ScriptLibrary } from '../domain/scriptLibrary';
import { addGroup, addScript, parseConditionList, removeGroup, updateScript } from './ScriptLibraryEditor';

const original: ScriptLibrary = {
  schemaVersion: 1, revision: 1, groups: [], updatedAt: '', updatedBy: { id: '', name: '' },
};
const grouped = addGroup(original, 'group-1');
assert.equal(original.groups.length, 0, '不能修改服务器原始对象');
assert.equal(grouped.groups[0].id, 'group-1');

const scripted = addScript(grouped, 'group-1', 'script-1');
assert.equal(grouped.groups[0].scripts.length, 0);
assert.equal(scripted.groups[0].scripts[0].id, 'script-1');

const edited = updateScript(scripted, 'group-1', 'script-1', {
  title: '索要联系方式',
  match: { orderStatuses: ['已付款'], productKeywords: ['口播'], contactState: 'MISSING' },
});
assert.equal(scripted.groups[0].scripts[0].title, '新话术');
assert.equal(edited.groups[0].scripts[0].title, '索要联系方式');
assert.equal(edited.groups[0].scripts[0].match.contactState, 'MISSING');

const removed = removeGroup(edited, 'group-1');
assert.deepEqual(removed.groups, [], '删除分组必须级联删除其中话术');
assert.equal(edited.groups.length, 1);
assert.deepEqual(parseConditionList('已付款, 已完成\n已付款，待发货'), ['已付款', '已完成', '待发货']);

console.log('browser script editor model: ok');
