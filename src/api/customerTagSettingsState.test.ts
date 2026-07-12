import assert from 'node:assert/strict';
import { formatCustomerTagDialogError, staleMigrationMessage } from '../pages/Settings/customerTagSettingsState';

assert.equal(formatCustomerTagDialogError(403, '仅超级管理员可管理'), '无管理权限：仅超级管理员可管理');
assert.equal(formatCustomerTagDialogError(409, '标签名称已存在'), '数据已变化：标签名称已存在');
assert.equal(formatCustomerTagDialogError(500, '服务不可用'), '服务不可用');
assert.equal(formatCustomerTagDialogError(-1), '操作失败');
assert.equal(staleMigrationMessage('checksum 已失效'), 'checksum 已失效，请重新预览后再整理。');
