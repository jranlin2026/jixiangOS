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
  requireRead: express.RequestHandler;
  requireCourseWrite: express.RequestHandler;
  requireSessionWrite: express.RequestHandler;
  requireEngagementWrite: express.RequestHandler;
  requireReviewWrite: express.RequestHandler;
}) {
  const router = express.Router();

  router.get('/dashboard', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.getDashboard(req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/courses', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listCourses(pageQuery(req.query as any), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/course-categories', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listCourseCategories(req.currentUser!);
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
  router.get('/courses/:courseId/assets', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listCourseAssets(String(req.params.courseId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.put('/courses/:courseId/assets', deps.requireCourseWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.saveCourseAsset(String(req.params.courseId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/sessions', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.listSessions(pageQuery(req.query as any), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/sessions/:sessionId', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.getSessionDetail(String(req.params.sessionId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/sessions', deps.requireSessionWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.createSession(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });
  router.post('/sessions/:sessionId/status', deps.requireSessionWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.changeSessionStatus(String(req.params.sessionId), String(req.body?.status || '') as AcademySessionStatus, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.patch('/tasks/:taskId', deps.requireSessionWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.updateTask(String(req.params.taskId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.put('/engagements', deps.requireEngagementWrite, async (req: AuthenticatedRequest, res) => {
    const result = await deps.service.saveEngagement(req.body || {}, req.currentUser!);
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
