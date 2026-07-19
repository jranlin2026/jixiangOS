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
});

assert.equal(precheck[0].status, 'ready');
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
});

assert.match(blocked[0].reason, /系统中已存在/);
assert.match(blocked[1].reason, /无权覆盖销售负责人/);
assert.match(blocked[2].reason, /手机号或微信至少填写一项/);

const ambiguousSource = validateCustomerImportRows([{ ...rows[0], leadSource: '同名来源' }], {
  currentOwnerId: 'u1', currentOwnerName: '销售甲', canOverrideAttribution: false,
  owners: [{ id: 'u1', name: '销售甲' }], lifecycleStatuses: [], customerLevels: [], tags: [], existingContactKeys: new Set(),
  leadSources: [{ value: '来源A', label: '同名来源' }, { value: '来源B', label: '同名来源' }],
});
assert.match(ambiguousSource[0].reason, /线索来源存在重名/);

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
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
}], false);

assert.equal(exportRows[0]['客户姓名'], '张三');
assert.equal(exportRows[0]['线索来源'], '市场品牌部-官网');
assert.equal(Object.prototype.hasOwnProperty.call(exportRows[0], '手机号'), false);
assert.equal(Object.prototype.hasOwnProperty.call(exportRows[0], '微信'), false);

console.log('customer data exchange policy: ok');
