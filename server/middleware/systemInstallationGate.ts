import type { RequestHandler } from 'express';
import type { SystemSetupService } from '../services/systemSetupService';

const PUBLIC_PATHS = new Set(['/api/health']);

export function createSystemInstallationGate(service: Pick<SystemSetupService, 'status'>): RequestHandler {
  return async (request, response, next) => {
    if (PUBLIC_PATHS.has(request.path) || request.path.startsWith('/api/system/setup/')) {
      next();
      return;
    }

    const status = await service.status();
    if (status.code !== 0) {
      response.status(503).json({ code: 503, data: null, message: '无法确认系统初始化状态，请稍后再试' });
      return;
    }
    if (!status.data?.initialized) {
      response.status(503).json({ code: 503, data: null, message: '系统尚未初始化，请先完成初始化向导' });
      return;
    }
    next();
  };
}
