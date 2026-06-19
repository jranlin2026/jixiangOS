import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/**
 * 格式化金额：千分位 + 2位小数
 * @param amount 金额数值
 * @param prefix 前缀符号，默认 ¥
 * @returns 格式化后的金额字符串
 */
export const formatCurrency = (amount: number, prefix: string = '¥'): string => {
  if (amount == null || isNaN(amount)) return `${prefix}0.00`;
  const formatted = Math.abs(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? '-' : '';
  return `${sign}${prefix}${formatted}`;
};

/**
 * 格式化日期
 * @param dateStr ISO 8601 日期字符串或 Date 对象
 * @param pattern 格式化模式，默认 yyyy-MM-dd
 * @returns 格式化后的日期字符串
 */
export const formatDate = (
  dateStr: string | Date,
  pattern: string = 'yyyy-MM-dd',
): string => {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return format(date, pattern, { locale: zhCN });
  } catch {
    return typeof dateStr === 'string' ? dateStr : dateStr.toISOString();
  }
};

/**
 * 格式化日期时间
 * @param dateStr ISO 8601 日期字符串或 Date 对象
 * @returns 格式化后的日期时间字符串
 */
export const formatDateTime = (dateStr: string | Date): string => {
  return formatDate(dateStr, 'yyyy-MM-dd HH:mm');
};

/**
 * 格式化相对时间
 * @param dateStr ISO 8601 日期字符串或 Date 对象
 * @returns 相对时间字符串（如"3小时前"）
 */
export const formatRelativeTime = (dateStr: string | Date): string => {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
  } catch {
    return typeof dateStr === 'string' ? dateStr : dateStr.toISOString();
  }
};

/**
 * 格式化百分比
 * @param value 数值（0.1 = 10%）
 * @param decimals 小数位数，默认1位
 * @returns 格式化后的百分比字符串
 */
export const formatPercent = (value: number, decimals: number = 1): string => {
  if (value == null || isNaN(value)) return '0%';
  return `${(value * 100).toFixed(decimals)}%`;
};

/**
 * 格式化环比涨跌
 * @param current 当前值
 * @param previous 前期值
 * @returns 涨跌信息对象
 */
export const formatChange = (
  current: number,
  previous: number,
): {
  value: string;
  direction: 'up' | 'down' | 'flat';
  color: string;
  arrow: string;
} => {
  if (previous === 0) {
    if (current > 0) {
      return {
        value: '+100%',
        direction: 'up',
        color: '#4CAF50',
        arrow: '↑',
      };
    }
    return { value: '0%', direction: 'flat', color: '#9ca3af', arrow: '—' };
  }

  const changeRate = ((current - previous) / previous) * 100;
  const sign = changeRate > 0 ? '+' : '';
  const direction = changeRate > 0 ? 'up' : changeRate < 0 ? 'down' : 'flat';
  const color =
    direction === 'up' ? '#4CAF50' : direction === 'down' ? '#F44336' : '#9ca3af';
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '—';

  return {
    value: `${sign}${changeRate.toFixed(1)}%`,
    direction,
    color,
    arrow,
  };
};

/**
 * 格式化数字（千分位）
 * @param value 数值
 * @returns 千分位格式化字符串
 */
export const formatNumber = (value: number): string => {
  if (value == null || isNaN(value)) return '0';
  return value.toLocaleString('zh-CN');
};

export const formatPaginationRows = ({
  from,
  to,
  count,
}: {
  from: number;
  to: number;
  count: number;
}): string => {
  if (count === 0) return '0 / 共 0 条';
  return `${from}-${to} / 共 ${count} 条`;
};

/**
 * 截断文本
 * @param text 原始文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 */
export const truncateText = (text: string, maxLength: number = 50): string => {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
};
