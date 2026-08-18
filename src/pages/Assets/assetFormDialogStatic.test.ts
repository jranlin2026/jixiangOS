import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
const assetApiSource = readFileSync(new URL('../../api/assetApi.ts', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../../../server/index.ts', import.meta.url), 'utf8');
const formDialog = source.match(/<ProtectedFormDialog[\s\S]*?<\/ProtectedFormDialog>/)?.[0] || '';

assert.match(formDialog, /maxWidth="md"/, '资产录入弹窗应限制为中等桌面宽度，避免输入框过宽');
assert.match(formDialog, /markButtonClicksDirty=\{false\}/, '关闭、取消和分区按钮不应把空白表单误判为已填写');
assert.match(source, /label=\{formState\.mode === 'edit' \? '新服务密码（留空不修改）' : '服务密码'\}/, '编辑态应说明留空保留原服务密码');
assert.match(source, /clearServicePassword/, '手机号表单应支持明确清除已存服务密码');
assert.match(source, /formatPhoneSlotImeiLabel/, '设备卡槽选项应显示对应的 IMEI 标识');
assert.match(assetApiSource, /reveal\/service-password/, '后端模式应通过独立接口查看服务密码');
assert.match(serverSource, /requireAssetSensitiveViewAccess[\s\S]*?revealPhoneServicePassword/, '服务密码查看接口应校验敏感字段权限');
