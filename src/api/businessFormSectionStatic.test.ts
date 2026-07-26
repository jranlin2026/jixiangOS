import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const section = fs.readFileSync(path.join(root, 'src/shared/components/BusinessFormSection.tsx'), 'utf8');
const orderForm = fs.readFileSync(path.join(root, 'src/pages/Orders/OrderForm.tsx'), 'utf8');
const recoveryForm = fs.readFileSync(path.join(root, 'src/pages/AfterSales/RecoveryOrderTab.tsx'), 'utf8');

assert.match(section, /borderLeft: '4px solid'/, '统一业务表单分段应有清晰的左侧蓝色识别条');
assert.match(section, /收起/);
assert.match(section, /展开/);
assert.match(section, /errorCount/);
assert.match(section, /setExpanded\(true\)/, '校验失败时应自动展开错误分段');

for (const step of [1, 2, 3, 4, 5]) {
  assert.match(orderForm, new RegExp(`BusinessFormSection[\\s\\S]{0,120}step=\\{${step}\\}`), `订单表单缺少第 ${step} 段`);
  assert.match(recoveryForm, new RegExp(`BusinessFormSection[\\s\\S]{0,120}step=\\{${step}\\}`), `售后挽回表单缺少第 ${step} 段`);
}

assert.doesNotMatch(orderForm, /function FormSection/);
assert.doesNotMatch(recoveryForm, /function RecoveryFormSection/);
assert.match(recoveryForm, /title="客户信息"/);
assert.match(recoveryForm, /title="原订单信息"/);
assert.match(recoveryForm, /title="挽回信息"/);
assert.match(recoveryForm, /title="收款与凭证"/);
assert.match(recoveryForm, /title="补充信息"/);
assert.match(recoveryForm, /maxWidth="lg"/);
assert.match(recoveryForm, /title="收款与凭证"[\s\S]*label="官方收款渠道"[\s\S]*BusinessAttachmentPicker[\s\S]*<\/BusinessFormSection>/);
assert.match(recoveryForm, /submitAttempted/);

console.log('business form section static tests passed');
