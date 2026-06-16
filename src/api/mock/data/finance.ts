import type { FinanceDailyRecord, ChannelROI } from '../../../types/finance';

/** 最近30天的财务日数据 */
export const mockFinanceDailyRecords: FinanceDailyRecord[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  const dateStr = date.toISOString().split('T')[0];
  const baseRevenue = 15000 + Math.random() * 25000;
  const refundChance = Math.random();
  const revenue = Math.round(baseRevenue);
  const cost = Math.round(revenue * (0.4 + Math.random() * 0.15));
  const refundAmount = refundChance > 0.85 ? Math.round(revenue * 0.3) : 0;
  const orderCount = Math.floor(3 + Math.random() * 8);
  const newCustomers = Math.floor(1 + Math.random() * 4);

  return {
    date: dateStr,
    revenue,
    cost,
    profit: revenue - cost - refundAmount,
    orderCount,
    refundAmount,
    newCustomers,
  };
});

/** 渠道 ROI 数据 */
export const mockChannelROI: ChannelROI[] = [
  {
    channel: '搜索引擎',
    investment: 50000,
    revenue: 280000,
    leads: 320,
    conversions: 45,
    roi: 4.6,
    costPerLead: 156.25,
  },
  {
    channel: '社交媒体',
    investment: 35000,
    revenue: 180000,
    leads: 240,
    conversions: 32,
    roi: 4.14,
    costPerLead: 145.83,
  },
  {
    channel: '展会',
    investment: 80000,
    revenue: 450000,
    leads: 180,
    conversions: 55,
    roi: 4.63,
    costPerLead: 444.44,
  },
  {
    channel: '转介绍',
    investment: 10000,
    revenue: 320000,
    leads: 120,
    conversions: 48,
    roi: 31.0,
    costPerLead: 83.33,
  },
  {
    channel: '直销',
    investment: 25000,
    revenue: 150000,
    leads: 80,
    conversions: 20,
    roi: 5.0,
    costPerLead: 312.50,
  },
];
