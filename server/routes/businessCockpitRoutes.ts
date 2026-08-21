import { Router, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { BusinessCockpitData, DashboardDateRange, DashboardRangePreset, ManagementTargetConfig } from '../../src/types/dashboard';

type BusinessCockpitResult = {
  code: number;
  data: BusinessCockpitData | null;
  message: string;
};

export interface BusinessCockpitQueryService {
  get(range: DashboardDateRange, actor: AuthenticatedUser): Promise<BusinessCockpitResult>;
  getTargetConfig(month: string, actor: AuthenticatedUser): Promise<{ code: number; data: ManagementTargetConfig | null; message: string }>;
  saveTargetConfig(input: ManagementTargetConfig, actor: AuthenticatedUser): Promise<{ code: number; data: ManagementTargetConfig | null; message: string }>;
}

function text(value: unknown): string {
  if (Array.isArray(value)) return text(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isFinite(date.getTime()) && date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) === value;
}

export function parseBusinessCockpitRange(query: Record<string, unknown>): DashboardDateRange {
  const preset = (text(query.preset) || 'month') as DashboardRangePreset;
  if (!['today', 'week', 'month', 'custom'].includes(preset)) throw new Error('不支持的统计范围');
  const anchorDate = text(query.anchorDate);
  const departmentId = text(query.departmentId);
  if (anchorDate && !validDate(anchorDate)) throw new Error('日期格式不正确');
  if (preset !== 'custom') return { preset, ...(anchorDate ? { anchorDate } : {}), ...(departmentId ? { departmentId } : {}) };

  const startDate = text(query.startDate);
  const endDate = text(query.endDate);
  if (!startDate || !endDate) throw new Error('自定义时间必须同时选择开始和结束日期');
  if (!validDate(startDate) || !validDate(endDate)) throw new Error('日期格式不正确');
  if (startDate > endDate) throw new Error('开始日期不能晚于结束日期');
  return { preset, startDate, endDate, ...(departmentId ? { departmentId } : {}) };
}

export function createBusinessCockpitRouter(options: {
  service: BusinessCockpitQueryService;
  requireAuth: RequestHandler;
}) {
  const router = Router();
  router.get('/business-cockpit', options.requireAuth, async (req: AuthenticatedRequest, res) => {
    let range: DashboardDateRange;
    try {
      range = parseBusinessCockpitRange(req.query as Record<string, unknown>);
    } catch (error) {
      res.status(400).json({
        code: 400,
        data: null,
        message: error instanceof Error ? error.message : '统计范围无效',
      });
      return;
    }
    try {
      const result = await options.service.get(range, req.currentUser!);
      res.status(result.code === 0 ? 200 : result.code >= 400 ? result.code : 400).json(result);
    } catch {
      res.status(500).json({
        code: 500,
        data: null,
        message: '驾驶舱数据加载失败',
      });
    }
  });
  router.get('/management-targets/:month', options.requireAuth, async (req: AuthenticatedRequest, res) => {
    const month = text(req.params.month);
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ code: 400, data: null, message: '月份格式不正确' });
    const result = await options.service.getTargetConfig(month, req.currentUser!);
    return res.status(result.code === 0 ? 200 : result.code).json(result);
  });
  router.put('/management-targets/:month', options.requireAuth, async (req: AuthenticatedRequest, res) => {
    const month = text(req.params.month);
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ code: 400, data: null, message: '月份格式不正确' });
    const result = await options.service.saveTargetConfig({ ...(req.body || {}), month }, req.currentUser!);
    return res.status(result.code === 0 ? 200 : result.code).json(result);
  });
  return router;
}
