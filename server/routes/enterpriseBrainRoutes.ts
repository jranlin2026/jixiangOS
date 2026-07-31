import { Router, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { PositionStandardService } from '../services/enterpriseBrain/positionStandardService';
import type { EnterpriseTaskService } from '../services/enterpriseBrain/taskService';
import type { EnterpriseAiAssistantService } from '../services/enterpriseBrain/aiAssistantService';
import type { EnterpriseCockpitService } from '../services/enterpriseBrain/cockpitService';

const statusFor = (code: number, successStatus = 200) => code === 0 ? successStatus : [400, 403, 404, 409].includes(code) ? code : 400;

export function createEnterpriseBrainRouter(deps: {
  requireAuth: RequestHandler;
  standards: PositionStandardService;
  tasks: EnterpriseTaskService;
  ai: EnterpriseAiAssistantService;
  cockpit: EnterpriseCockpitService;
}) {
  const router = Router();
  router.use(deps.requireAuth);

  router.get('/standards/me', async (req: AuthenticatedRequest, res) => {
    const result = await deps.standards.getMyStandard(req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/standards', async (req: AuthenticatedRequest, res) => {
    const result = await deps.standards.listWorkspace(req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/standards/drafts', async (req: AuthenticatedRequest, res) => {
    const result = await deps.standards.saveDraft(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });
  router.post('/standards/versions/:versionId/publish', async (req: AuthenticatedRequest, res) => {
    const result = await deps.standards.publish(String(req.params.versionId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  router.get('/task-templates', async (req: AuthenticatedRequest, res) => {
    const result = await deps.tasks.listTemplates(req.query, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/task-templates', async (req: AuthenticatedRequest, res) => {
    const result = await deps.tasks.saveTemplate(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });
  router.post('/tasks/generate', async (req: AuthenticatedRequest, res) => {
    const result = await deps.tasks.generateDailyTasks(String(req.body?.date || ''), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/tasks/mine', async (req: AuthenticatedRequest, res) => {
    const result = await deps.tasks.listMyTasks(req.query, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/tasks/team', async (req: AuthenticatedRequest, res) => {
    const result = await deps.tasks.listTeamTasks(req.query, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/tasks/assign', async (req: AuthenticatedRequest, res) => {
    const result = await deps.tasks.assignOneOff(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });
  router.post('/tasks/:taskId/complete', async (req: AuthenticatedRequest, res) => {
    const result = await deps.tasks.completeTask(String(req.params.taskId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/tasks/:taskId/confirm', async (req: AuthenticatedRequest, res) => {
    const result = await deps.tasks.confirmTask(String(req.params.taskId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/reviews', async (req: AuthenticatedRequest, res) => {
    const result = await deps.tasks.submitReview(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/reviews/team', async (req: AuthenticatedRequest, res) => {
    const result = await deps.tasks.listTeamReviews(req.query, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  router.get('/ai/conversations', async (req: AuthenticatedRequest, res) => {
    const result = await deps.ai.listConversations(req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/ai/conversations/:conversationId', async (req: AuthenticatedRequest, res) => {
    const result = await deps.ai.getConversation(String(req.params.conversationId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.delete('/ai/conversations/:conversationId', async (req: AuthenticatedRequest, res) => {
    const result = await deps.ai.deleteConversation(String(req.params.conversationId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/ai/query', async (req: AuthenticatedRequest, res) => {
    const result = await deps.ai.ask(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/ai/audits', async (req: AuthenticatedRequest, res) => {
    const result = await deps.ai.listAudits(req.query, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  router.get('/cockpit', async (req: AuthenticatedRequest, res) => {
    const result = await deps.cockpit.getCockpit(req.query, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  return router;
}
