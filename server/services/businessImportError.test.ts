import assert from 'node:assert/strict';
import { safeBusinessImportErrorMessage } from './businessImportError';

assert.equal(
  safeBusinessImportErrorMessage(new Error('该第三方平台订单号已经创建过售后挽回订单')),
  '该第三方平台订单号已经创建过售后挽回订单',
  '有效重复订单必须向用户显示具体原因，不能降级成后台通用错误',
);
assert.equal(
  safeBusinessImportErrorMessage(new Error('SQL connection password leaked')),
  '导入执行失败，请重试或联系管理员',
  '未知内部错误仍需隐藏实现细节',
);

console.log('business import error tests passed');
