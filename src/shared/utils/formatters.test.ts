import assert from 'node:assert/strict';
import { formatCurrency, formatDate, formatRelativeTime } from './formatters';

assert.equal(formatDate({}), '-', '对象型脏日期不得让页面崩溃');
assert.equal(formatDate(new Date('invalid')), '-', '无效 Date 不得二次调用 toISOString 抛错');
assert.equal(formatDate('not-a-date'), 'not-a-date', '非法原始日期字符串应保留为可诊断文本');
assert.equal(formatRelativeTime({}), '-', '相对时间也必须安全处理非日期对象');
assert.equal(formatCurrency(Number.POSITIVE_INFINITY), '¥0.00', '无限金额不得渲染为非有限货币');

console.log('formatter tests passed');
