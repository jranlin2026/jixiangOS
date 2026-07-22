import assert from 'node:assert/strict';
import {
  normalizeCustomerImportRows,
  projectCustomerExportRows,
  validateCustomerImportRows,
} from './customerDataExchangePolicy';

const rows = normalizeCustomerImportRows([
  {
    rowNumber: 2,
    name: ' 张三 ',
    phone: '138 0000 0000',
    wechat: '',
    company: '示例公司',
    ownerName: '销售甲',
    lifecycleStatus: '跟进中',
    customerLevel: 'L2-意向',
    leadSource: '市场品牌部-官网',
    industry: '教育',
    city: '厦门',
    tagNames: '高意向，复购',
    remark: '重点客户',
  },
]);

assert.equal(rows[0].name, '张三');
assert.equal(rows[0].phone, '+8613800000000');
assert.deepEqual(rows[0].tagNames, ['高意向', '复购']);

const precheck = validateCustomerImportRows(rows, {
  currentOwnerId: 'u1',
  currentOwnerName: '销售甲',
  canOverrideAttribution: false,
  owners: [{ id: 'u1', name: '销售甲' }, { id: 'u2', name: '销售乙' }],
  lifecycleStatuses: [{ code: 'following', name: '跟进中' }],
  customerLevels: [{ value: 'L2', label: 'L2-意向' }],
  leadSources: [{ value: '市场品牌部', label: '市场品牌部-官网', sourceName: '官网' }],
  tags: [{ id: 't1', name: '高意向' }, { id: 't2', name: '复购' }],
  existingContactKeys: new Set<string>(),
  existingCustomerNames: new Set(['张三']),
}, 'assigned');

assert.equal(precheck[0].status, 'ready');
assert.match(precheck[0].reason, /客户名称与系统或本次文件中已有客户相同.*不阻止导入/);
assert.equal(precheck[0].input.ownerId, 'u1');
assert.equal(precheck[0].input.lifecycleStatusCode, 'following');
assert.equal(precheck[0].input.customerLevel, 'L2');
assert.equal(precheck[0].input.leadSource, '市场品牌部');
assert.equal(precheck[0].input.sourceName, '官网');
assert.deepEqual(precheck[0].input.manualTagIds, ['t1', 't2']);

const blocked = validateCustomerImportRows([
  ...rows,
  { ...rows[0], rowNumber: 3, name: '李四', phone: '', wechat: 'wx-a', ownerName: '销售乙', tagNames: [] },
  { ...rows[0], rowNumber: 4, name: '王五', phone: '', wechat: '', tagNames: [] },
], {
  currentOwnerId: 'u1',
  currentOwnerName: '销售甲',
  canOverrideAttribution: false,
  owners: [{ id: 'u1', name: '销售甲' }, { id: 'u2', name: '销售乙' }],
  lifecycleStatuses: [{ code: 'following', name: '跟进中' }],
  customerLevels: [{ value: 'L2', label: 'L2-意向' }],
  leadSources: [{ value: '市场品牌部', label: '市场品牌部-官网', sourceName: '官网' }],
  tags: [{ id: 't1', name: '高意向' }, { id: 't2', name: '复购' }],
  existingContactKeys: new Set(['phone:+8613800000000']),
}, 'assigned');

assert.match(blocked[0].reason, /系统中已存在/);
assert.match(blocked[1].reason, /无权覆盖销售负责人/);
assert.match(blocked[2].reason, /手机号或微信至少填写一项/);

const sameNameInFile = validateCustomerImportRows([
  { ...rows[0], phone: '', wechat: 'wx-first' },
  { ...rows[0], rowNumber: 3, phone: '', wechat: 'wx-second' },
], {
  currentOwnerId: 'u1', currentOwnerName: '销售甲', canOverrideAttribution: false,
  owners: [{ id: 'u1', name: '销售甲' }], lifecycleStatuses: [{ code: 'following', name: '跟进中' }],
  customerLevels: [{ value: 'L2', label: 'L2-意向' }], leadSources: [{ value: '市场品牌部', label: '市场品牌部-官网', sourceName: '官网' }],
  tags: [{ id: 't1', name: '高意向' }, { id: 't2', name: '复购' }], existingContactKeys: new Set(),
}, 'assigned');
assert.equal(sameNameInFile[1].status, 'ready');
assert.match(sameNameInFile[0].reason, /客户名称.*不阻止导入/);
assert.match(sameNameInFile[1].reason, /客户名称.*不阻止导入/);

const ambiguousSource = validateCustomerImportRows([{ ...rows[0], leadSource: '同名来源' }], {
  currentOwnerId: 'u1', currentOwnerName: '销售甲', canOverrideAttribution: false,
  owners: [{ id: 'u1', name: '销售甲' }], lifecycleStatuses: [], customerLevels: [], tags: [], existingContactKeys: new Set(),
  leadSources: [{ value: '来源A', label: '同名来源' }, { value: '来源B', label: '同名来源' }],
}, 'assigned');
assert.match(ambiguousSource[0].reason, /线索来源存在重名/);

const publicPoolReady = validateCustomerImportRows([{ ...rows[0], ownerName: '', lifecycleStatus: '', customerLevel: '', leadSource: '', tagNames: [] }], {
  currentOwnerId: 'u1', currentOwnerName: '销售甲', canOverrideAttribution: false,
  owners: [{ id: 'u1', name: '销售甲' }], lifecycleStatuses: [], customerLevels: [], leadSources: [], tags: [], existingContactKeys: new Set(),
}, 'public_pool');
assert.equal(publicPoolReady[0].status, 'ready');
assert.equal(publicPoolReady[0].input.owner, '公海');
assert.equal(publicPoolReady[0].input.ownerId, undefined);
assert.equal(publicPoolReady[0].input.ownerIdentityStatus, 'public_pool');
assert.equal(publicPoolReady[0].input.lifecycleStatusCode, 'public_pool');

const publicPoolHistoryOwners = validateCustomerImportRows(normalizeCustomerImportRows([{
  ...rows[0], rowNumber: 5, ownerName: '', lifecycleStatus: '', tagNames: '高意向、复购', previousOwnerName: '销售乙', firstOwnerName: '销售丙',
}]), {
  currentOwnerId: 'u1', currentOwnerName: '销售甲', canOverrideAttribution: true,
  owners: [{ id: 'u1', name: '销售甲' }, { id: 'u2', name: '销售乙' }, { id: 'u3', name: '销售丙' }],
  lifecycleStatuses: [], customerLevels: [{ value: 'L2', label: 'L2-意向' }],
  leadSources: [{ value: '市场品牌部', label: '市场品牌部-官网', sourceName: '官网' }],
  tags: [{ id: 't1', name: '高意向' }, { id: 't2', name: '复购' }], existingContactKeys: new Set(),
}, 'public_pool');
assert.equal(publicPoolHistoryOwners[0].status, 'ready');
assert.equal(publicPoolHistoryOwners[0].input.ownerId, undefined);
assert.equal(publicPoolHistoryOwners[0].input.lifecycleStatusCode, 'public_pool');
assert.equal(publicPoolHistoryOwners[0].input.previousOwner, '销售乙');
assert.equal(publicPoolHistoryOwners[0].input.originalSalesTransferBy, '销售丙');

const historyOwnerWithoutPermission = validateCustomerImportRows(normalizeCustomerImportRows([{
  ...rows[0], ownerName: '', tagNames: '高意向、复购', previousOwnerName: '销售甲', firstOwnerName: '销售甲',
}]), {
  currentOwnerId: 'u1', currentOwnerName: '销售甲', canOverrideAttribution: false,
  owners: [{ id: 'u1', name: '销售甲' }], lifecycleStatuses: [{ code: 'following', name: '跟进中' }],
  customerLevels: [{ value: 'L2', label: 'L2-意向' }],
  leadSources: [{ value: '市场品牌部', label: '市场品牌部-官网', sourceName: '官网' }],
  tags: [{ id: 't1', name: '高意向' }, { id: 't2', name: '复购' }], existingContactKeys: new Set(),
}, 'assigned');
assert.equal(historyOwnerWithoutPermission[0].status, 'blocked');
assert.match(historyOwnerWithoutPermission[0].reason, /无权导入历史销售负责人/);

const departedHistoryOwner = validateCustomerImportRows(normalizeCustomerImportRows([{
  ...rows[0], ownerName: '', tagNames: '高意向、复购', previousOwnerName: '已离职销售', firstOwnerName: '',
}]), {
  currentOwnerId: 'u1', currentOwnerName: '销售甲', canOverrideAttribution: true,
  owners: [{ id: 'u1', name: '销售甲' }], lifecycleStatuses: [{ code: 'following', name: '跟进中' }],
  customerLevels: [{ value: 'L2', label: 'L2-意向' }],
  leadSources: [{ value: '市场品牌部', label: '市场品牌部-官网', sourceName: '官网' }],
  tags: [{ id: 't1', name: '高意向' }, { id: 't2', name: '复购' }], existingContactKeys: new Set(),
}, 'assigned');
assert.equal(departedHistoryOwner[0].status, 'ready');
assert.equal(departedHistoryOwner[0].input.previousOwner, '已离职销售');

const publicPoolBlocked = validateCustomerImportRows([
  { ...rows[0], ownerName: '销售甲', lifecycleStatus: '', customerLevel: '', leadSource: '', tagNames: [] },
  { ...rows[0], rowNumber: 3, phone: '', wechat: 'wx-public', ownerName: '', lifecycleStatus: '跟进中', customerLevel: '', leadSource: '', tagNames: [] },
], {
  currentOwnerId: 'u1', currentOwnerName: '销售甲', canOverrideAttribution: false,
  owners: [{ id: 'u1', name: '销售甲' }], lifecycleStatuses: [{ code: 'following', name: '跟进中' }], customerLevels: [], leadSources: [], tags: [], existingContactKeys: new Set(),
}, 'public_pool');
assert.match(publicPoolBlocked[0].reason, /导入公海池时销售负责人必须留空/);
assert.match(publicPoolBlocked[1].reason, /导入公海池时客户进展必须留空/);

const assignedPublicPoolStatus = validateCustomerImportRows([{ ...rows[0], lifecycleStatus: '流失公海', customerLevel: '', leadSource: '', tagNames: [] }], {
  currentOwnerId: 'u1', currentOwnerName: '销售甲', canOverrideAttribution: false,
  owners: [{ id: 'u1', name: '销售甲' }], lifecycleStatuses: [{ code: 'public_pool', name: '流失公海' }], customerLevels: [], leadSources: [], tags: [], existingContactKeys: new Set(),
}, 'assigned');
assert.match(assignedPublicPoolStatus[0].reason, /请选择直接导入公海池/);

const exportRows = projectCustomerExportRows([{
  id: 'c1',
  name: '张三',
  phone: '+8613800000000',
  wechat: 'wx-a',
  company: '示例公司',
  owner: '销售甲',
  customerLevel: 'L2',
  lifecycleStatusCode: 'following',
  leadSource: '市场品牌部',
  sourceName: '官网',
  manualTagIds: [],
  tags: ['高意向'],
  totalSpent: 100,
  orderCount: 1,
  growthPath: [],
  growthRecords: [],
  activityRecords: [
    { id: 'note-newer', type: 'note', title: '普通动态', content: '不应导出', operator: '销售甲', createdAt: '2026-07-04T00:00:00.000Z' },
    { id: 'follow-latest', type: 'follow', title: '发表了跟进记录', content: '客户已确认报价', operator: '销售甲', createdAt: '2026-07-03T00:00:00.000Z' },
    { id: 'follow-old', type: 'follow', title: '发表了跟进记录', content: '首次沟通', operator: '销售甲', createdAt: '2026-07-02T00:00:00.000Z' },
  ],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
}], false);

assert.equal(exportRows[0]['客户姓名'], '张三');
assert.equal(exportRows[0]['线索来源'], '市场品牌部-官网');
assert.equal(exportRows[0]['最后跟进记录'], '客户已确认报价');
assert.equal(Object.prototype.hasOwnProperty.call(exportRows[0], '手机号'), false);
assert.equal(Object.prototype.hasOwnProperty.call(exportRows[0], '微信'), false);

console.log('customer data exchange policy: ok');
