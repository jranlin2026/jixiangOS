import assert from 'node:assert/strict';
import {
  assertLifecycleTransition,
  getManualLifecycleTargets,
  normalizeCustomerLifecycleConfig,
  normalizeCustomerLifecycleValue,
} from './customerLifecyclePolicy';

const config = normalizeCustomerLifecycleConfig({
  statuses: [
    { id: 'new', code: 'new', name: '新客户', color: '#999', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
    { id: 'contacted', code: 'contacted', name: '已联系', color: '#369', isActive: true, sortOrder: 2, createdAt: '', updatedAt: '' },
    { id: 'following', code: 'following', name: '跟进中', color: '#396', isActive: true, sortOrder: 3, createdAt: '', updatedAt: '' },
    { id: 'disabled', code: 'disabled', name: '已停用', color: '#666', isActive: false, sortOrder: 4, createdAt: '', updatedAt: '' },
    { id: 'pool', code: 'public_pool', name: '公海', color: '#333', isActive: true, sortOrder: 5, createdAt: '', updatedAt: '' },
  ],
  transitions: {
    new: ['contacted', 'following'],
    contacted: ['following'],
    following: ['contacted'],
  },
  enabledStatusCodes: ['contacted', 'following', 'public_pool'],
});

assert.deepEqual(
  getManualLifecycleTargets(config).map((item) => item.code),
  ['contacted', 'following'],
);
assert.doesNotThrow(() => assertLifecycleTransition({ from: 'new', to: 'contacted', config }));
assert.throws(
  () => assertLifecycleTransition({ from: 'new', to: 'public_pool', config }),
  /系统状态/,
);

const storedArrayConfig = normalizeCustomerLifecycleConfig([
  {
    id: 'stored-new', code: 'new', name: '新客户', color: '#999', isActive: true, sortOrder: 1,
    allowedManualTargetCodes: ['contacted'], createdAt: '', updatedAt: '',
  },
  {
    id: 'stored-contacted', code: 'contacted', name: '已联系', color: '#369', isActive: true, sortOrder: 2,
    allowedManualTargetCodes: ['following'], createdAt: '', updatedAt: '',
  },
  {
    id: 'stored-following', code: 'following', name: '跟进中', color: '#396', isActive: true, sortOrder: 3,
    allowedManualTargetCodes: ['contacted'], createdAt: '', updatedAt: '',
  },
]);
assert.deepEqual(storedArrayConfig.transitions, {
  new: ['contacted'],
  contacted: ['following'],
  following: ['contacted'],
});
assert.throws(
  () => assertLifecycleTransition({ from: 'new', to: 'disabled', config }),
  /已停用/,
);
assert.throws(
  () => assertLifecycleTransition({ from: 'following', to: 'following', config }),
  /不允许/,
);

// 历史配置常常只有状态数组，没有 allowedManualTargetCodes 或 transitions；
// 已启用的自定义人工状态仍必须可互转，系统终态仍由专用业务命令控制。
const historicalCustomConfig = normalizeCustomerLifecycleConfig([
  { id: 'legacy-new', code: 'new', name: '新客户', color: '#999', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
  { id: 'legacy-contacted', code: 'contacted', name: '已联系', color: '#369', isActive: true, sortOrder: 2, createdAt: '', updatedAt: '' },
  { id: 'legacy-custom', code: 'proposal_sent', name: '方案已发', color: '#396', isActive: true, sortOrder: 3, createdAt: '', updatedAt: '' },
  { id: 'legacy-pool', code: 'public_pool', name: '公海', color: '#333', isActive: true, sortOrder: 4, createdAt: '', updatedAt: '' },
]);
assert.doesNotThrow(() => assertLifecycleTransition({ from: 'new', to: 'contacted', config: historicalCustomConfig }));
assert.doesNotThrow(() => assertLifecycleTransition({ from: 'contacted', to: 'proposal_sent', config: historicalCustomConfig }));
assert.throws(
  () => assertLifecycleTransition({ from: 'proposal_sent', to: 'public_pool', config: historicalCustomConfig }),
  /系统状态/,
);

// 真实早期配置只保存展示 name，没有 code；服务端必须映射为稳定 code，
// 否则历史客户的通用进展更新会找不到起点或被错误拒绝。
const historicalNameOnlyConfig = normalizeCustomerLifecycleConfig([
  { id: 'legacy-1', name: '未转商机', description: '', color: '#111111', isActive: true, sortOrder: 99, isSystem: true, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'legacy-2', name: '商机跟进中', description: '', color: '#222222', isActive: true, sortOrder: 99, isSystem: true, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'legacy-3', name: '已流失', description: '', color: '#333333', isActive: true, sortOrder: 99, isSystem: true, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' },
]);
assert.deepEqual(
  historicalNameOnlyConfig.statuses.map((status) => status.code),
  ['pending_followup', 'following', 'public_pool'],
);
assert.doesNotThrow(() => assertLifecycleTransition({
  from: 'pending_followup', to: 'following', config: historicalNameOnlyConfig,
}));

// 部分早期环境已把数组包进 policy 对象，连 enabledStatusCodes 与
// transitions 都仍然是展示名。三处必须一起映射，否则状态行虽然正常，
// 实际流转仍会因为图的键不匹配而被拒绝。
const historicalNameOnlyPolicyObject = normalizeCustomerLifecycleConfig({
  statuses: [
    { id: 'legacy-policy-1', name: '未转商机', color: '#111111', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
    { id: 'legacy-policy-2', name: '商机跟进中', color: '#222222', isActive: true, sortOrder: 2, createdAt: '', updatedAt: '' },
  ],
  enabledStatusCodes: ['未转商机', '商机跟进中'],
  transitions: {
    未转商机: ['商机跟进中'],
    商机跟进中: ['未转商机'],
  },
});
assert.deepEqual(historicalNameOnlyPolicyObject.enabledStatusCodes, ['pending_followup', 'following']);
assert.deepEqual(historicalNameOnlyPolicyObject.transitions, {
  pending_followup: ['following'],
  following: ['pending_followup'],
});
assert.doesNotThrow(() => assertLifecycleTransition({
  from: 'pending_followup', to: 'following', config: historicalNameOnlyPolicyObject,
}));

const unknownNameOnlyCustomConfig = normalizeCustomerLifecycleConfig([
  { id: 'legacy-custom-name', name: '续费培育中', color: '#444444', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
]);
assert.equal(
  unknownNameOnlyCustomConfig.statuses[0].code,
  '续费培育中',
  '未知自定义展示名必须保留，不能被共享默认映射压成 pending_followup',
);
assert.equal(normalizeCustomerLifecycleValue('未转商机'), 'pending_followup');
assert.equal(
  normalizeCustomerLifecycleValue('续费培育中'),
  '续费培育中',
  '供命令边界复用的归一化函数同样不能吞掉未知自定义状态',
);

console.log('customer lifecycle policy tests passed');
