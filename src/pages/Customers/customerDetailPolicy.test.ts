import assert from 'node:assert/strict';
import type { Customer } from '../../types/customer';
import type { CustomerTodo } from '../../types/customerTodo';
import {
  buildManageableOwnerIds,
  buildCustomerDetailPatch,
  buildCustomerDetailActionPolicy,
  buildCustomerWriteActionPolicy,
  canRunCustomerTodoAction,
} from './customerDetailPolicy';

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'customer-1',
  name: '原客户名',
  company: '原公司',
  phone: '13800000000',
  customerLevel: 'A',
  owner: '销售甲',
  ownerId: 'user-owner',
  ownerIdentityStatus: 'resolved',
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  leadSource: '线上',
  sourceName: '搜索',
  sourceType: '个人资源',
  leadContributorId: 'user-contributor',
  leadContributorName: '贡献人',
  originalSalesTransferBy: '原销售',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

{
  const manageableOwnerIds = buildManageableOwnerIds('user-owner', []);
  assert.deepEqual([...manageableOwnerIds], ['user-owner'], '目录请求尚未成功时也必须保留当前用户稳定 ID');
  assert.equal(buildCustomerDetailActionPolicy({
    customer: customer(),
    manageableOwnerIds,
    canEditProfile: true,
    canSetTodos: false,
    readOnly: false,
  }).canManageCustomer, true, 'profile-only 用户管理自有客户不得因目录 403 被误判');
}

{
  const current = customer();
  const patch = buildCustomerDetailPatch({
    current,
    draft: {
      ...current,
      name: '新客户名',
      leadSource: '线下',
      sourceName: '地推',
      leadContributorId: 'user-other',
      leadContributorName: '其他贡献人',
    },
    canEditProfile: true,
    canEditAttribution: false,
    canEditLockedContact: false,
  });
  assert.deepEqual(patch, { name: '新客户名' }, '仅资料权限改名不得携带归属字段');
}

{
  const current = customer();
  const patch = buildCustomerDetailPatch({
    current,
    draft: { ...current, name: '不应修改的客户名', sourceName: '地推' },
    canEditProfile: false,
    canEditAttribution: true,
    canEditLockedContact: false,
  });
  assert.deepEqual(patch, { sourceName: '地推' }, '归属-only 角色只提交归属组差量');
}

{
  const current = customer();
  const patch = buildCustomerDetailPatch({
    current,
    draft: { ...current, sourceName: '地推', originalSalesTransferBy: '' },
    canEditProfile: true,
    canEditAttribution: true,
    canEditLockedContact: false,
  });
  assert.deepEqual(patch, { sourceName: '地推', originalSalesTransferBy: '' });
  assert.deepEqual(buildCustomerDetailPatch({
    current,
    draft: { ...current },
    canEditProfile: true,
    canEditAttribution: true,
    canEditLockedContact: true,
  }), {}, '完全未改动时不提交字段');

  assert.deepEqual(buildCustomerDetailPatch({
    current,
    draft: { ...current, phone: '13900000000' },
    canEditProfile: true,
    canEditAttribution: false,
    canEditLockedContact: false,
  }), {}, '已锁定联系方式被恶意改写时不得连带修改城市');
}

{
  const manageable = buildCustomerDetailActionPolicy({
    customer: customer(),
    manageableOwnerIds: new Set(['user-owner']),
    canEditProfile: true,
    canSetTodos: true,
    readOnly: false,
  });
  assert.deepEqual(manageable, {
    canManageCustomer: true,
    canAddFollowUp: true,
    canManageTodos: true,
  });

  const contributorOnly = buildCustomerDetailActionPolicy({
    customer: customer({ ownerId: 'user-other' }),
    manageableOwnerIds: new Set(['user-owner']),
    canEditProfile: true,
    canSetTodos: true,
    readOnly: false,
  });
  assert.equal(contributorOnly.canManageCustomer, false);
  assert.equal(contributorOnly.canAddFollowUp, false);
  assert.equal(contributorOnly.canManageTodos, false);

  const legacyNameOnly = buildCustomerDetailActionPolicy({
    customer: customer({ ownerId: undefined, ownerIdentityStatus: 'unresolved' }),
    manageableOwnerIds: new Set(['user-owner']),
    canEditProfile: true,
    canSetTodos: true,
    readOnly: false,
  });
  assert.equal(legacyNameOnly.canManageCustomer, false, '客户管理权不得依赖显示名');
}

{
  const contributorReadOnly = buildCustomerWriteActionPolicy({
    customer: customer({
      ownerId: 'user-other',
      leadContributorId: 'user-self',
    }),
    manageableOwnerIds: new Set(['user-self']),
    permissions: {
      editProfile: true,
      editAttribution: true,
      setTags: true,
      setTodos: true,
      setProgress: true,
      transfer: true,
      release: true,
      delete: true,
    },
    readOnly: false,
  });
  assert.equal(contributorReadOnly.canManageCustomer, false);
  assert.deepEqual(contributorReadOnly.actions, {
    editProfile: false,
    editAttribution: false,
    setTags: false,
    setTodos: false,
    setProgress: false,
    transfer: false,
    release: false,
    delete: false,
    addFollowUp: false,
  }, '贡献人可读不得让任何显式叶子越过 manageability');

  const publicPoolReadOnly = buildCustomerWriteActionPolicy({
    customer: customer({
      ownerId: undefined,
      ownerIdentityStatus: 'public_pool',
      lifecycleStatusCode: 'public_pool',
    }),
    manageableOwnerIds: new Set(['user-self']),
    permissions: {
      editProfile: true,
      editAttribution: true,
      setTags: true,
      setTodos: true,
      setProgress: true,
      transfer: true,
      release: true,
      delete: true,
    },
    readOnly: false,
  });
  assert.equal(publicPoolReadOnly.canManageCustomer, false);
  assert.equal(
    Object.values(publicPoolReadOnly.actions).some(Boolean),
    false,
    '公海可读客户即使具备所有写叶子，也不得显示普通写入入口',
  );
}

const todo = (overrides: Partial<CustomerTodo> = {}): CustomerTodo => ({
  id: 'todo-1',
  customerId: 'customer-1',
  customerName: '原客户名',
  title: '待办',
  dueAt: '2026-07-18T00:00:00.000Z',
  status: 'pending',
  executionMethod: 'none',
  assigneeId: 'user-self',
  assigneeName: '当前用户',
  createdById: 'user-owner',
  createdByName: '销售甲',
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
  ...overrides,
});

assert.equal(canRunCustomerTodoAction('complete', todo(), 'user-self', false, false), true, '执行人可以完成自己的待办');
assert.equal(canRunCustomerTodoAction('complete', todo({ assigneeId: 'user-other' }), 'user-self', false, false), false);
assert.equal(canRunCustomerTodoAction('reopen', todo({ status: 'completed' }), 'user-self', false, false), false);
assert.equal(canRunCustomerTodoAction('reopen', todo({ status: 'completed' }), 'user-self', true, false), true);
assert.equal(canRunCustomerTodoAction('complete', todo(), 'user-self', true, true), false, '显式只读详情不执行写入');
