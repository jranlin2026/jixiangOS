import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
const formDialog = source.match(/<ProtectedFormDialog[\s\S]*?<\/ProtectedFormDialog>/)?.[0] || '';

assert.match(formDialog, /maxWidth="md"/, '资产录入弹窗应限制为中等桌面宽度，避免输入框过宽');
assert.match(formDialog, /markButtonClicksDirty=\{false\}/, '关闭、取消和分区按钮不应把空白表单误判为已填写');
assert.match(source, /renderTextField\('servicePassword', '服务密码', \{ type: 'password' \}\)/, '手机号表单应提供服务密码敏感输入');
assert.match(source, /formatPhoneSlotImeiLabel/, '设备卡槽选项应显示对应的 IMEI 标识');
