import assert from 'node:assert/strict';
import { getBusinessExportDisabledReason } from './businessExportDialogModel';

assert.equal(getBusinessExportDisabledReason({ expectedCount: 0, reason: '备份' }), '当前筛选条件下没有可导出数据');
assert.equal(getBusinessExportDisabledReason({ expectedCount: 10_001, reason: '备份' }), '导出数量超过 10,000 条，请缩小筛选范围');
assert.equal(getBusinessExportDisabledReason({ expectedCount: 10_000, reason: '备份' }), '');
assert.equal(getBusinessExportDisabledReason({ expectedCount: 1, reason: '   ' }), '请填写导出原因');
assert.equal(getBusinessExportDisabledReason({ expectedCount: 1, reason: '备份', busy: true }), '导出文件正在生成');
