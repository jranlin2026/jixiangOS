import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

const sharedFields = read('src/shared/components/BusinessSourceFields.tsx');
const leadForm = read('src/pages/Leads/LeadForm.tsx');
const customerForm = read('src/pages/Customers/CustomerForm.tsx');
const leadDetail = read('src/pages/Leads/LeadDetail.tsx');
const customerDetail = read('src/pages/Customers/CustomerDetail.tsx');
const leadList = read('src/pages/Leads/index.tsx');
const customerList = read('src/pages/Customers/index.tsx');

assert.match(sharedFields, /sourceProductName/, '来源交易字段组件应承载购买产品');
assert.match(sharedFields, /sourceProductId/, '来源交易字段组件应保存系统产品ID');
assert.match(sharedFields, /sourcePaymentAmount/, '来源交易字段组件应承载付款金额');
assert.match(sharedFields, /select[\s\S]*label="平台购买产品"/, '平台购买产品应为系统产品下拉选择');
assert.match(sharedFields, /getProductLevelColor/, '产品下拉应复用系统产品等级颜色');
assert.match(sharedFields, /sourcePaymentAmount:\s*product\s*\?\s*String\(product\.price\)/, '选择产品后应自动带入系统产品价格');
assert.match(sharedFields, /label="平台付款金额"/, '平台付款金额字段标签应清晰');
assert.match(sharedFields, /paymentTimeLabel = '平台付款时间'/, '平台付款时间字段标签应清晰');

for (const [name, source] of [['线索', leadForm], ['客户', customerForm]] as const) {
  assert.match(source, /includePurchaseSnapshot/, `${name}新增表单应展示来源交易购买信息`);
  assert.match(source, /sourceProductName/, `${name}表单应保存购买产品`);
  assert.match(source, /productApi\.getProducts\(\)/, `${name}表单应读取系统设置产品列表`);
  assert.ok((source.match(/<BusinessSourceFields/g) || []).length >= 2, `${name}新增和编辑表单应复用完整平台购买字段`);
  assert.match(source, /sourcePaymentAmount/, `${name}表单应保存付款金额`);
  assert.match(source, /form\.sourcePaymentAmount === '' \? \(isEdit \? null : undefined\)/, `${name}编辑时应能清空已保存的付款金额`);
  assert.match(source, /form\.sourcePaymentAt \? new Date\(form\.sourcePaymentAt\)\.toISOString\(\) : \(isEdit \? null : undefined\)/, `${name}编辑时应能清空已保存的平台付款时间`);
}

assert.match(leadDetail, /平台购买产品/, '线索详情应展示平台购买产品');
assert.match(leadDetail, /平台付款金额/, '线索详情应展示平台付款金额');
assert.match(leadDetail, /平台付款时间/, '线索详情应展示平台付款时间');
assert.match(customerDetail, /平台购买产品/, '客户详情应展示平台购买产品');
assert.match(customerDetail, /平台付款金额/, '客户详情应展示平台付款金额');
assert.match(customerDetail, /平台付款时间/, '客户详情应展示平台付款时间');
assert.match(
  customerDetail,
  /sourcePaymentAt \? formatDate\(currentCustomer\.sourcePaymentAt, 'yyyy-MM-dd HH:mm:ss'\) : '-'/,
  '客户详情首次平台交易的付款时间应精确到秒',
);

assert.match(leadList, /id: 'sourceProductName', label: '平台购买产品'/, '线索列表应提供平台购买产品列');
assert.match(leadList, /id: 'sourcePaymentAmount', label: '平台付款金额'/, '线索列表应提供平台付款金额列');
assert.match(customerList, /id: 'sourceProductName', label: '平台购买产品'/, '客户列表应提供平台购买产品列');
assert.match(customerList, /id: 'sourcePaymentAmount', label: '平台付款金额'/, '客户列表应提供平台付款金额列');

console.log('lead/customer purchase snapshot UI: ok');
