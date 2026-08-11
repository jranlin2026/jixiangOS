import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const customerForm = readFileSync(new URL('./CustomerForm.tsx', import.meta.url), 'utf8');
const leadForm = readFileSync(new URL('../Leads/LeadForm.tsx', import.meta.url), 'utf8');

for (const source of [customerForm, leadForm]) {
  for (const field of ['wechatNickname', 'douyinId', 'douyinNickname']) {
    assert.match(source, new RegExp(`${field}: ''`), `${field} 必须初始化为空字符串`);
    assert.match(source, new RegExp(`form\\.${field}`), `${field} 必须绑定到表单`);
  }
  for (const label of ['社交账号', '微信号', '微信昵称', '抖音号', '抖音昵称']) {
    assert.match(source, new RegExp(label), `表单必须展示 ${label}`);
  }
  assert.match(source, /normalizeOptionalSocialProfileFields/, '提交前必须统一校验社交账号字段');
  assert.match(
    source,
    /const missingContact = !form\.phone\.trim\(\) && !form\.alternatePhone\.trim\(\) && !form\.wechat\.trim\(\)/,
    '新增字段不得参与联系人必填或查重规则',
  );
}

console.log('social profile form static tests passed');
