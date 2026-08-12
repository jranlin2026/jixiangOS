import express from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { AcademyService, AcademySessionStatus } from '../services/academy/academyService';

const statusFor = (code: number, successStatus = 200) => (
  code === 0 ? successStatus : [400, 403, 404, 409].includes(code) ? code : 400
);

const pageQuery = (query: Record<string, unknown>) => ({
  page: Math.max(1, Number(query.page) || 1),
  pageSize: Math.min(100, Math.max(1, Number(query.pageSize) || 10)),
  search: String(query.search || '').trim(),
  status: String(query.status || '').trim(),
});

export function createAcademyRouter(deps: {
  service: AcademyService;
  requireAuthenticated: express.RequestHandler;
  requireDashboardRead: express.RequestHandler;
  requireCourseListRead: express.RequestHandler;
  requireCourseManageRead: express.RequestHandler;
  requireSopTemplateRead: express.RequestHandler;
  requireSessionRead: express.RequestHandler;
  requireSessionDetailRead: express.RequestHandler;
  requireCourseWrite: express.RequestHandler;
  requireArrangementWrite: express.RequestHandler;
  requireSessionWrite: express.RequestHandler;
  requireTaskWrite: express.RequestHandler;
  requireEngagementWrite: express.RequestHandler;
  requireReviewWrite: express.RequestHandler;
}) {
  const router = express.Router();

  router.get('/public-calendar', deps.requireAuthenticated, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listPublicCalendar({
      start: String(req.query.start || '').trim(),
      end: String(req.query.end || '').trim(),
    }, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/my-tasks', deps.requireAuthenticated, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listMyTasks(pageQuery(req.query as any), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  router.get('/dashboard', deps.requireDashboardRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.getDashboard(req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/courses', deps.requireCourseListRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listCourses(pageQuery(req.query as any), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/course-categories', deps.requireCourseManageRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listCourseCategories(req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/sop-templates', deps.requireSopTemplateRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listSopTemplates(req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.put('/sop-templates', deps.requireCourseWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.saveSopTemplate(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.delete('/sop-templates/:templateId', deps.requireCourseWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.deleteSopTemplate(String(req.params.templateId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.put('/course-categories', deps.requireCourseWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.saveCourseCategory(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/courses', deps.requireCourseWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.createCourse(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });
  router.put('/courses/:courseId', deps.requireCourseWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.updateCourse(String(req.params.courseId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/courses/:courseId/status', deps.requireCourseWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.changeCourseStatus(String(req.params.courseId), String(req.body?.status || '') as any, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/courses/:courseId/assets', deps.requireCourseManageRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listCourseAssets(String(req.params.courseId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.put('/courses/:courseId/assets', deps.requireCourseWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.saveCourseAsset(String(req.params.courseId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/sessions', deps.requireSessionRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listSessions(pageQuery(req.query as any), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/sessions/:sessionId', deps.requireSessionDetailRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.getSessionDetail(String(req.params.sessionId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/sessions/:sessionId/next-step', deps.requireSessionRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.getSessionNextStep(String(req.params.sessionId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/sessions', deps.requireArrangementWrite, async (req: AuthenticatedRequest, res) => {
    const { isHistoricalBackfill: _ignored, ...body } = req.body || {};
    const result = await deps.service.createSession(body, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });
  router.post('/sessions/historical', deps.requireArrangementWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.createSession({ ...(req.body || {}), isHistoricalBackfill: true }, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });
  router.put('/sessions/:sessionId', deps.requireArrangementWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.updateSession(String(req.params.sessionId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/sessions/:sessionId/status', deps.requireSessionWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.changeSessionStatus(String(req.params.sessionId), String(req.body?.status || '') as AcademySessionStatus, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.patch('/tasks/:taskId', deps.requireTaskWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.updateTask(String(req.params.taskId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/tasks/:taskId/attachments', deps.requireAuthenticated, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listTaskAttachments(String(req.params.taskId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.put('/tasks/:taskId/attachments', deps.requireAuthenticated, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.replaceTaskAttachments(String(req.params.taskId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.put('/engagements', deps.requireEngagementWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.saveEngagement(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.put('/engagements/batch', deps.requireEngagementWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.saveEngagementBatch(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/engagements/:engagementId/follow-up', deps.requireEngagementWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.quickFollowUp(String(req.params.engagementId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.patch('/engagements/:engagementId/execution', deps.requireSessionWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.updateEngagementExecution(String(req.params.engagementId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.put('/engagements/:engagementId/order', deps.requireEngagementWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.linkEngagementOrder(String(req.params.engagementId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.put('/reviews', deps.requireReviewWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.saveReview(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });

  return router;
}
