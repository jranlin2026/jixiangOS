import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { leadBulkImportApi, LEAD_BULK_IMPORT_HEADERS } from './leadBulkImportApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { CAPABILITY_KEYS, PERMISSION_KEYS } from '../shared/utils/permissions';
import type { Customer } from '../types/customer';

const H = {
  name: '\u59d3\u540d*',
  company: '\u516c\u53f8',
  phone: '\u624b\u673a\u53f7',
  wechat: '\u5fae\u4fe1',
  sourceType: '\u8d44\u6e90\u5f52\u5c5e',
  source: '\u7ebf\u7d22\u6765\u6e90*',
  industry: '\u884c\u4e1a',
  city: '\u57ce\u5e02',
  inputBy: '\u7ebf\u7d22\u5f55\u5165\u4eba',
  leadContributor: '\u7ebf\u7d22\u8d21\u732e\u4eba',
  owner: '\u5206\u914d\u9500\u552e',
  tags: '\u6807\u7b7e',
  remark: '\u5907\u6ce8',
} as const;

const zh = {
  official: '\u5b98\u7f51',
  douyin: '\u6296\u97f3',
  live: '\u76f4\u64ad',
  inputUser: '\u5f55\u5165\u5458',
  operator: '\u8fd0\u8425\u4e13\u5458',
  zhangWei: '\u5f20\u4f1f',
  salesConsultant: '\u9500\u552e\u987e\u95ee',
  duplicateCustomer: '\u5df2\u5b58\u5728\u5ba2\u6237',
  customerCompany: '\u5ba2\u6237\u5e93\u516c\u53f8',
  newLead: '\u65b0\u7ebf\u7d22',
  newCompany: '\u65b0\u516c\u53f8',
  companyResource: '\u516c\u53f8\u8d44\u6e90',
  technology: '\u79d1\u6280',
  beijing: '\u5317\u4eac',
  key: '\u91cd\u70b9',
  highIntent: '\u9ad8\u610f\u5411',
  importRemark: '\u6279\u91cf\u5bfc\u5165\u6d4b\u8bd5',
  duplicateCompany: '\u91cd\u590d\u516c\u53f8',
  formatErrorCompany: '\u683c\u5f0f\u9519\u8bef\u516c\u53f8',
  successStatus: '\u5165\u5e93\u6210\u529f',
  failedStatus: '\u5165\u5e93\u5931\u8d25',
} as const;

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

function toArrayBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const view = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

async function workbookBuffer(rows: Record<string, string>[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('\u7ebf\u7d22\u6279\u91cf\u5165\u5e93\u6a21\u677f');
  sheet.addRow([...LEAD_BULK_IMPORT_HEADERS]);
  rows.forEach((row) => {
    sheet.addRow(LEAD_BULK_IMPORT_HEADERS.map((header) => row[header] || ''));
  });
  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}

const now = '2026-06-19T00:00:00.000Z';

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.TAG_GROUPS, JSON.stringify([{ id: 'tag-group-both', name: '通用', color: '#1677ff', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now }]));
storage.setItem(STORAGE_KEYS.TAGS, JSON.stringify([
  { id: 'tag-key', groupId: 'tag-group-both', name: zh.key, color: '#1677ff', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now },
  { id: 'tag-high', groupId: 'tag-group-both', name: zh.highIntent, color: '#1677ff', isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_SOURCE_CONFIGS, JSON.stringify([
  { id: 'src-1', name: zh.official, isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
  { id: 'src-2', name: zh.douyin, isActive: true, sortOrder: 2, createdAt: now, updatedAt: now },
  { id: 'src-3', name: zh.live, parentId: 'src-2', isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
  { id: 'dept-ops', name: '运营部', code: 'OPS', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-sales', name: '销售部', code: 'SALES', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
  {
    id: 'role-ops',
    name: zh.operator,
    code: 'ops_admin',
    permissions: [{ module: PERMISSION_KEYS.LEADS_CREATE, actions: ['read', 'write'] }],
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-sales-consultant',
    name: zh.salesConsultant,
    code: 'sales_consultant',
    permissions: [
      { module: CAPABILITY_KEYS.LEADS_RECEIVE, actions: ['read'] },
      { module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] },
    ],
    dataScopes: { leads: 'self' },
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
]));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
  { id: 'user-1', name: zh.inputUser, account: 'input', email: 'input@company.com', phone: '', role: zh.operator, roleId: 'role-ops', departmentId: 'dept-ops', isActive: true, createdAt: now, updatedAt: now },
  { id: 'user-2', name: zh.zhangWei, account: 'zhangwei', email: 'zhangwei@company.com', phone: '', role: zh.salesConsultant, roleId: 'role-sales-consultant', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
]));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-1',
  token: 'test-token',
  remember: true,
  createdAt: now,
}));
const duplicateCustomer: Customer = {
  id: 'cust-duplicate',
  name: zh.duplicateCustomer,
  company: zh.customerCompany,
  phone: '13800000000',
  wechat: '',
  owner: zh.zhangWei,
  customerLevel: 'L1',
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  createdAt: now,
  updatedAt: now,
};
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([duplicateCustomer]));

assert.deepEqual(LEAD_BULK_IMPORT_HEADERS, [
  H.name,
  H.company,
  H.phone,
  H.wechat,
  H.sourceType,
  H.source,
  H.industry,
  H.city,
  H.inputBy,
  H.leadContributor,
  H.owner,
  H.tags,
  H.remark,
]);

const templateBuffer = await leadBulkImportApi.createTemplateWorkbook();
const templateWorkbook = new ExcelJS.Workbook();
await templateWorkbook.xlsx.load(templateBuffer);
const templateSheet = templateWorkbook.getWorksheet('\u7ebf\u7d22\u6279\u91cf\u5165\u5e93\u6a21\u677f');
const optionsSheet = templateWorkbook.getWorksheet('\u5b57\u6bb5\u9009\u9879');
const instructionsSheet = templateWorkbook.getWorksheet('填写说明');
assert.ok(templateSheet);
assert.ok(optionsSheet);
assert.ok(instructionsSheet);
assert.equal(instructionsSheet!.getCell('A1').value, '线索批量入库填写说明');
assert.deepEqual(
  LEAD_BULK_IMPORT_HEADERS.map((_, index) => templateSheet!.getCell(1, index + 1).value),
  [...LEAD_BULK_IMPORT_HEADERS],
);
assert.equal(optionsSheet!.state, 'hidden');
assert.equal(optionsSheet!.getCell('B2').value, zh.official);
assert.equal(optionsSheet!.getCell('B3').value, zh.douyin);
assert.equal(optionsSheet!.getCell('B4').value, `${zh.douyin}-${zh.live}`);
assert.equal(optionsSheet!.getCell('E2').value, '\u5f85\u5206\u914d');
assert.equal(optionsSheet!.getCell('E3').value, zh.zhangWei);
assert.equal(templateSheet!.getCell('F2').dataValidation?.type, 'list');
assert.equal(templateSheet!.getCell('K2').dataValidation?.type, 'list');

const result = await leadBulkImportApi.importWorkbook(await workbookBuffer([
  {
    [H.name]: zh.newLead,
    [H.company]: zh.newCompany,
    [H.phone]: '13900000000',
    [H.wechat]: '',
    [H.sourceType]: '',
    [H.source]: `${zh.douyin}-${zh.live}`,
    [H.industry]: zh.technology,
    [H.city]: zh.beijing,
    [H.inputBy]: '',
    [H.leadContributor]: '',
    [H.owner]: zh.zhangWei,
    [H.tags]: `${zh.key}, ${zh.highIntent}`,
    [H.remark]: zh.importRemark,
  },
  {
    [H.name]: zh.duplicateCustomer,
    [H.company]: zh.duplicateCompany,
    [H.phone]: '13800000000',
    [H.wechat]: '',
    [H.sourceType]: zh.companyResource,
    [H.source]: zh.official,
    [H.industry]: '',
    [H.city]: '',
    [H.inputBy]: zh.inputUser,
    [H.leadContributor]: '',
    [H.owner]: '',
    [H.tags]: '',
    [H.remark]: '',
  },
  {
    [H.name]: '',
    [H.company]: zh.formatErrorCompany,
    [H.phone]: '',
    [H.wechat]: '',
    [H.sourceType]: '',
    [H.source]: '',
    [H.industry]: '',
    [H.city]: '',
    [H.inputBy]: '',
    [H.leadContributor]: '',
    [H.owner]: '',
    [H.tags]: '',
    [H.remark]: '',
  },
]));

assert.equal(result.code, 0);
assert.equal(result.data.successCount, 1);
assert.equal(result.data.failureCount, 2);
assert.equal(result.data.rows[0].status, 'success');
assert.equal(result.data.rows[0].rowNumber, 2);
assert.match(result.data.rows[1].reason || '', /\u624b\u673a\u53f7\u5df2\u5b58\u5728\u4e8e\u5ba2\u6237\u5e93/);
assert.equal(result.data.rows[1].rowNumber, 3);
assert.match(result.data.rows[2].reason || '', /\u59d3\u540d\u4e0d\u80fd\u4e3a\u7a7a/);
assert.equal(result.data.rows[2].rowNumber, 4);

const leads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]');
assert.equal(leads.length, 1);
assert.equal(leads[0].name, zh.newLead);
assert.equal(leads[0].source, zh.douyin);
assert.equal(leads[0].sourceName, zh.live);
assert.deepEqual(leads[0].tags, [zh.key, zh.highIntent]);
assert.deepEqual(leads[0].manualTagIds, ['tag-key', 'tag-high']);

const unknownTag = await leadBulkImportApi.importWorkbook(await workbookBuffer([{
  [H.name]: '未知标签线索', [H.phone]: '13900000008', [H.source]: zh.official, [H.tags]: '未预设标签',
}]));
assert.equal(unknownTag.data.failureCount, 1);
assert.equal(unknownTag.data.rows[0].reason, '标签“未预设标签”未在系统设置中预设');

const invalidImportBase = { [H.source]: zh.official };
const twentyOneTags = Array.from({ length: 21 }, (_, index) => ({
  id: `bulk-${index}`,
  groupId: 'tag-group-both',
  name: `批量标签${index}`,
  color: '#1677ff',
  isActive: true,
  sortOrder: index + 10,
  createdAt: now,
  updatedAt: now,
}));
storage.setItem(STORAGE_KEYS.TAGS, JSON.stringify([
  ...JSON.parse(storage.getItem(STORAGE_KEYS.TAGS) || '[]'),
  ...twentyOneTags,
]));
const tooManyTags = await leadBulkImportApi.importWorkbook(await workbookBuffer([{
  ...invalidImportBase,
  [H.name]: '超量标签线索',
  [H.phone]: '13900000009',
  [H.tags]: twentyOneTags.map((tag) => tag.name).join(','),
}]));
assert.equal(tooManyTags.data.failureCount, 1);
assert.match(tooManyTags.data.rows[0].reason || '', /每条记录最多选择 20 个标签/);

storage.setItem(STORAGE_KEYS.TAG_GROUPS, JSON.stringify([
  ...JSON.parse(storage.getItem(STORAGE_KEYS.TAG_GROUPS) || '[]'),
  { id: 'single-lead', name: '单选线索', color: '#1677ff', selectionMode: 'single', scope: 'lead', isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
  { id: 'customer-only', name: '客户专用', color: '#1677ff', selectionMode: 'multiple', scope: 'customer', isActive: true, sortOrder: 2, createdAt: now, updatedAt: now },
  { id: 'inactive-group', name: '停用组', color: '#1677ff', selectionMode: 'multiple', scope: 'lead', isActive: false, sortOrder: 3, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.TAGS, JSON.stringify([
  ...JSON.parse(storage.getItem(STORAGE_KEYS.TAGS) || '[]'),
  { id: 'single-a', groupId: 'single-lead', name: '单选甲', color: '#1677ff', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now },
  { id: 'single-b', groupId: 'single-lead', name: '单选乙', color: '#1677ff', isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
  { id: 'customer-tag', groupId: 'customer-only', name: '客户标签', color: '#1677ff', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now },
  { id: 'inactive-tag', groupId: 'inactive-group', name: '停用标签', color: '#1677ff', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now },
]));
const invalidPolicyRows = await leadBulkImportApi.importWorkbook(await workbookBuffer([
  { ...invalidImportBase, [H.name]: '单选冲突', [H.phone]: '13900000010', [H.tags]: '单选甲,单选乙' },
  { ...invalidImportBase, [H.name]: '范围错误', [H.phone]: '13900000011', [H.tags]: '客户标签' },
  { ...invalidImportBase, [H.name]: '停用错误', [H.phone]: '13900000012', [H.tags]: '停用标签' },
]));
assert.equal(invalidPolicyRows.data.failureCount, 3);
assert.match(invalidPolicyRows.data.rows[0].reason || '', /只能选择一项/);
assert.match(invalidPolicyRows.data.rows[1].reason || '', /不适用于线索/);
assert.match(invalidPolicyRows.data.rows[2].reason || '', /不存在或已停用/);
assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]').length, 1, '无效标签行不得写入线索');

const intakeRecords = JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || '[]');
assert.equal(intakeRecords.length, 2);
assert.equal(intakeRecords.some((record: any) => record.name === zh.newLead && record.status === zh.successStatus), true);
assert.equal(intakeRecords.some((record: any) => record.name === zh.duplicateCustomer && record.status === zh.failedStatus), true);
assert.equal(intakeRecords.some((record: any) => record.name === zh.formatErrorCompany), false);

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.TAG_GROUPS, JSON.stringify([{ id: 'tag-group-both', name: '通用', color: '#1677ff', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now }]));
storage.setItem(STORAGE_KEYS.TAGS, JSON.stringify([
  { id: 'tag-key', groupId: 'tag-group-both', name: zh.key, color: '#1677ff', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now },
  { id: 'tag-high', groupId: 'tag-group-both', name: zh.highIntent, color: '#1677ff', isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.LEAD_SOURCE_CONFIGS, JSON.stringify([
  { id: 'src-1', name: zh.official, isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
  { id: 'dept-sales', name: '销售部', code: 'SALES', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
  {
    id: 'role-sales-consultant',
    name: zh.salesConsultant,
    code: 'sales_consultant',
    permissions: [{ module: CAPABILITY_KEYS.LEADS_RECEIVE, actions: ['read'] }],
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
]));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
  { id: 'user-2', name: zh.zhangWei, account: 'zhangwei', email: 'zhangwei@company.com', phone: '', role: zh.salesConsultant, roleId: 'role-sales-consultant', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
]));
const generatedTemplateImport = await leadBulkImportApi.importWorkbook(await leadBulkImportApi.createTemplateWorkbook());
assert.equal(generatedTemplateImport.code, 0);
assert.equal(generatedTemplateImport.data.successCount, 1);
assert.equal(generatedTemplateImport.data.failureCount, 0);
const generatedTemplateLeads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]');
assert.equal(generatedTemplateLeads.length, 1);
assert.equal(generatedTemplateLeads[0].source, zh.official);
