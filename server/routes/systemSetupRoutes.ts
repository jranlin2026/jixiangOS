import { Router } from 'express';
import { failure } from '../api/response';
import type { SystemSetupService } from '../services/systemSetupService';

interface SystemSetupRouterOptions {
  service: SystemSetupService;
}

function responseStatus(code: number): number {
  if (code === 0) return 200;
  if (Number.isInteger(code) && code >= 400 && code < 600) return code;
  return 500;
}

export function createSystemSetupRouter(options: SystemSetupRouterOptions): Router {
  const router = Router();

  router.get('/status', async (_request, response) => {
    const result = await options.service.status();
    response.status(responseStatus(result.code)).json(result);
  });

  router.post('/initialize', async (request, response) => {
    const includeDemoData = request.body?.includeDemoData ?? false;
    if (typeof includeDemoData !== 'boolean') {
      const result = failure('演示数据开关必须是布尔值', 400);
      response.status(400).json(result);
      return;
    }
    const result = await options.service.initialize({
      setupToken: String(request.body?.setupToken || ''),
      companyName: String(request.body?.companyName || ''),
      adminName: String(request.body?.adminName || ''),
      adminAccount: String(request.body?.adminAccount || ''),
      adminEmail: String(request.body?.adminEmail || ''),
      adminPhone: String(request.body?.adminPhone || ''),
      adminPassword: String(request.body?.adminPassword || ''),
      organizationTemplate: request.body?.organizationTemplate,
      includeDemoData,
    });
    response.status(responseStatus(result.code)).json(result);
  });

  return router;
}
