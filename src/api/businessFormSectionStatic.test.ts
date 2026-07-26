import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const section = fs.readFileSync(path.join(root, 'src/shared/components/BusinessFormSection.tsx'), 'utf8');
const orderForm = fs.readFileSync(path.join(root, 'src/pages/Orders/OrderForm.tsx'), 'utf8');
const recoveryForm = fs.readFileSync(path.join(root, 'src/pages/AfterSales/RecoveryOrderTab.tsx'), 'utf8');

assert.match(section, /borderRadius: '14px !important'/, '统一业务表单分段应使用 C 方案轻量圆角卡片');
assert.match(section, /const borderColor = hasError \? '#fecaca' : '#d6e4f5'/, '卡片应使用轻量边框而非厚重蓝框');
assert.match(section, /borderRadius: '999px'/, '摘要状态应使用轻量胶囊标签');
assert.doesNotMatch(section, /borderLeft: '4px solid'/, 'C 方案不应保留左侧粗蓝色识别条');
assert.match(section, /收起/);
assert.match(section, /展开/);
assert.match(section, /errorCount/);
assert.match(section, /setExpanded\(true\)/, '校验失败时应自动展开错误分段');

for (const step of [1, 2, 3, 4, 5]) {
  assert.match(orderForm, new RegExp(`BusinessFormSection[\\s\\S]{0,120}step=\\{${step}\\}`), `订单表单缺少第 ${step} 段`);
  assert.match(recoveryForm, new RegExp(`BusinessFormSection[\\s\\S]{0,120}step=\\{${step}\\}`), `售后挽回表单缺少第 ${step} 段`);
}

assert.doesNotMatch(orderForm, /function FormSection/);
assert.match(orderForm, /<Dialog open=\{open\} onClose=\{onClose\} maxWidth="md" fullWidth>/, '订单申请弹窗桌面宽度应保持紧凑');
assert.match(orderForm, /<FormLabel[^>]*required[\s\S]{0,200}客户（搜索选择）[\s\S]{0,80}<\/FormLabel>/, 'C 方案客户字段名应显示在输入框上方');
assert.match(orderForm, /<FormLabel[^>]*>[\s\S]{0,80}销售负责人[\s\S]{0,20}<\/FormLabel>/, 'C 方案销售负责人字段名应显示在输入框上方');
assert.match(orderForm, /'aria-label': '客户（搜索选择）'/, '外置字段名后仍需保留输入框无障碍名称');
assert.match(orderForm, /htmlFor="order-customer-field" required/, '客户标签必须关联必填输入框');
assert.match(orderForm, /id="order-customer-field"[\s\S]{0,300}required/, '客户输入框必须保留必填语义');
assert.match(orderForm, /htmlFor="order-sales-owner-field"/, '销售负责人标签必须关联选择框');
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
