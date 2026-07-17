import assert from 'node:assert/strict';
import {
  assertLifecycleTransition,
  getManualLifecycleTargets,
  normalizeCustomerLifecycleConfig,
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

console.log('customer lifecycle policy tests passed');
