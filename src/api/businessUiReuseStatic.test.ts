import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const recovery = read('src/pages/AfterSales/RecoveryOrderTab.tsx');
const customer = read('src/pages/Customers/CustomerForm.tsx');
const lead = read('src/pages/Leads/LeadForm.tsx');

const recoveryCreate = recovery.slice(
  recovery.indexOf('<Dialog\n        open={open}'),
  recovery.indexOf('<Dialog\n        open={Boolean(detailOrder)}'),
);
assert.match(recoveryCreate, /maxWidth="md"/, '新增售后挽回订单应与订单申请使用相同宽度');
for (const label of ['申请人', '部门', '角色', '申请日期']) {
  assert.match(recoveryCreate, new RegExp(`label: '${label}'`), `售后申请信息条缺少${label}`);
}
for (const [step, title] of [[1, '客户信息'], [2, '原订单信息'], [3, '挽回成交信息'], [4, '收款与凭证'], [5, '补充信息']] as const) {
  assert.match(recoveryCreate, new RegExp(`step=\\{${step}\\}[\\s\\S]{0,100}solidStep[\\s\\S]{0,100}title="${title}"`));
}
assert.match(recoveryCreate, /position: 'sticky'[\s\S]*原付款金额[\s\S]*Number\(form\.originalAmount \|\| 0\)/, '售后表单底栏应实时显示原付款金额');
assert.match(recoveryCreate, /挽回金额[\s\S]*Number\(form\.recoveryAmount \|\| 0\)/, '售后表单底栏应实时显示挽回金额');
assert.match(recoveryCreate, />取消<\/[A-Za-z]+>[\s\S]*recoveryFormAction/, '底栏右侧应保留取消和提交动作');

const recoveryDetail = recovery.slice(
  recovery.indexOf('<Dialog\n        open={Boolean(detailOrder)}'),
  recovery.indexOf('<Dialog open={Boolean(historyOrder)}'),
);
assert.match(recoveryDetail, /fullScreen=\{mobileFullScreen\}/, '售后详情手机端应全屏');
assert.match(recoveryDetail, /'挽回单号'/, '售后详情摘要缺少挽回单号');
for (const label of ['分账状态', '挽回金额', '创建时间']) {
  assert.match(recoveryDetail, new RegExp(`label: '${label}'`), `售后详情摘要缺少${label}`);
}
for (const [step, title] of [[1, '客户信息'], [2, '原订单与来源'], [3, '挽回成交信息'], [4, '收款与凭证'], [5, '审核与系统记录']] as const) {
  assert.match(recoveryDetail, new RegExp(`step=\\{${step}\\}[\\s\\S]{0,160}title="${title}"`));
}
assert.match(recoveryDetail, /recoveryOperationSectionRef\.current\?\.scrollIntoView/);
assert.doesNotMatch(recoveryDetail, /setHistoryOrder\(detailOrder\)/, '详情内修改记录不应再打开重复弹窗');

for (const [source, entity] of [[customer, '客户'], [lead, '线索']] as const) {
  assert.match(source, /!isEdit \? \(/, `新增${entity}应使用独立的新建布局，避免改变编辑页`);
  for (const [step, title] of [[1, '客户信息'], [2, '来源与分配'], [3, '补充信息']] as const) {
    assert.match(source, new RegExp(`step=\\{${step}\\}[\\s\\S]{0,100}solidStep[\\s\\S]{0,100}title="${title}"`), `新增${entity}缺少${title}或未使用订单申请的实心步骤样式`);
  }
  assert.doesNotMatch(source, /step=\{4\}/, `新增${entity}应收敛为三个区块`);
  assert.match(source, /maxWidth="md"/);
}

const customerCreate = customer.slice(customer.indexOf('{!isEdit ? ('), customer.indexOf(') : (', customer.indexOf('{!isEdit ? (')));
assert.match(customerCreate, /title="客户信息"[\s\S]*label="行业"[\s\S]*label="城市"[\s\S]*label="客户等级"[\s\S]*label="首个销售负责人"/);
assert.match(customerCreate, /title="来源与分配"[\s\S]*label="销售负责人"/);

const leadCreate = lead.slice(lead.indexOf('{!isEdit ? ('), lead.indexOf(') : (', lead.indexOf('{!isEdit ? (')));
assert.match(leadCreate, /title="客户信息"[\s\S]*label="行业"[\s\S]*label="城市"/);
assert.match(leadCreate, /title="来源与分配"[\s\S]*label="分配销售"/);

console.log('business UI reuse static tests passed');
