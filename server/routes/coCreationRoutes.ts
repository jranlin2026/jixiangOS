import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { CoCreationService } from '../services/coCreation/coCreationService';

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export function createCoCreationRouter({ service, requireAuth }: { service: CoCreationService; requireAuth: RequestHandler }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/requests', async (req: AuthenticatedRequest, res) => res.json(await service.listRequests(req.currentUser!)));
  router.post('/requests', async (req: AuthenticatedRequest, res) => {
    const result = await service.createRequest(req.currentUser!, req.body || {});
    res.status(result.code === 0 ? 200 : result.code || 400).json(result);
  });
  router.get('/requests/:id', async (req: AuthenticatedRequest, res) => {
    const result = await service.getRequest(req.currentUser!, param(req.params.id));
    res.status(result.code === 0 ? 200 : result.code || 400).json(result);
  });
  router.post('/requests/:id/interview', async (req: AuthenticatedRequest, res) => {
    try {
      const result = await service.continueInterview(req.currentUser!, param(req.params.id), req.body?.answer);
      res.status(result.code === 0 ? 200 : result.code || 400).json(result);
    } catch (error) {
      res.status(500).json({ code: -1, data: null, message: error instanceof Error ? error.message : 'DeepSeek访谈失败' });
    }
  });
  router.post('/requests/:id/employee-confirmation', async (req: AuthenticatedRequest, res) => {
    const result = await service.confirmBrief(req.currentUser!, param(req.params.id));
    res.status(result.code === 0 ? 200 : result.code || 400).json(result);
  });
  router.post('/requests/:id/fact-confirmation', async (req: AuthenticatedRequest, res) => {
    const result = await service.confirmFacts(req.currentUser!, param(req.params.id), req.body || {});
    res.status(result.code === 0 ? 200 : result.code || 400).json(result);
  });
  router.post('/requests/:id/validation-decision', async (req: AuthenticatedRequest, res) => {
    const result = await service.decideValidation(req.currentUser!, param(req.params.id), req.body || {});
    res.status(result.code === 0 ? 200 : result.code || 400).json(result);
  });
  router.put('/requests/:id/validation', async (req: AuthenticatedRequest, res) => {
    const result = await service.saveValidation(req.currentUser!, param(req.params.id), req.body || {});
    res.status(result.code === 0 ? 200 : result.code || 400).json(result);
  });

  return router;
}
