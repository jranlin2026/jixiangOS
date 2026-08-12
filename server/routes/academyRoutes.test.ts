import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createAcademyRouter } from './academyRoutes';
import { createRequireAnyPermission, createRequireAuth } from '../middleware/auth';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

const actor: any = { id: 'u1', name: '运营员', isActive: true, permissions: [] };
const calls: any[] = [];
const gate = (name: string): express.RequestHandler => (req: any, _res, next) => {
  calls.push(['gate', name, req.path]);
  req.currentUser = actor;
  next();
};
const ok = (data: unknown) => ({ code: 0, data, message: 'success' });
const service: any = {
  getDashboard: async (current: any) => (calls.push(['dashboard', current.id]), ok({ activeCourses: 2 })),
  listPublicCalendar: async (query: any, current: any) => (calls.push(['public-calendar', query, current.id]), ok([{ id: 'session-public' }])),
  listMyTasks: async (query: any, current: any) => (calls.push(['my-tasks', query, current.id]), ok({ items: [], total: 0, page: query.page, pageSize: query.pageSize })),
  listCourseCategories: async () => (calls.push(['course-categories']), ok([{ id: 'category-1', name: '公开课' }])),
  saveCourseCategory: async (body: any) => (calls.push(['save-course-category', body]), ok({ id: 'category-2', ...body })),
  listSopTemplates: async () => (calls.push(['sop-templates']), ok([])),
  saveSopTemplate: async (body: any) => (calls.push(['save-sop-template', body]), ok({ id: 'sop-1', ...body })),
  deleteSopTemplate: async (id: string) => (calls.push(['delete-sop-template', id]), ok({ id })),
  listCourses: async (query: any) => (calls.push(['courses', query]), ok({ items: [], total: 21, page: query.page, pageSize: query.pageSize })),
  listSessions: async (query: any) => (calls.push(['sessions', query]), ok({ items: [], total: 0, page: query.page, pageSize: query.pageSize })),
  createCourse: async (body: any) => (calls.push(['create-course', body]), ok({ id: 'course-1' })),
  updateCourse: async (id: string, body: any) => (calls.push(['update-course', id, body]), ok({ id, ...body })),
  changeCourseStatus: async (id: string, status: string) => (calls.push(['course-status', id, status]), ok({ id, status })),
  listCourseAssets: async (id: string) => (calls.push(['course-assets', id]), ok([])),
  saveCourseAsset: async (id: string, body: any) => (calls.push(['save-course-asset', id, body]), ok({ id: 'asset-1', courseId: id, ...body })),
  createSession: async (body: any) => (calls.push(['create-session', body]), ok({ id: 'session-1' })),
  updateSession: async (id: string, body: any) => (calls.push(['update-session', id, body]), ok({ id, ...body })),
  getSessionDetail: async (id: string) => (calls.push(['session-detail', id]), ok({ id, tasks: [], engagements: [], review: null })),
  changeSessionStatus: async (id: string, status: string) => (calls.push(['status', id, status]), ok({ id, status })),
  getSessionNextStep: async (id: string) => (calls.push(['next-step', id]), ok({ task: { id: 'task-1' }, reason: 'NEAREST_DUE' })),
  updateTask: async (id: string, body: any) => (calls.push(['task', id, body]), ok({ id, ...body })),
  listTaskAttachments: async (id: string, current: any) => (calls.push(['task-attachments', id, current.id]), ok([])),
  replaceTaskAttachments: async (id: string, body: any, current: any) => (calls.push(['replace-task-attachments', id, body, current.id]), ok([])),
  saveEngagement: async (body: any) => (calls.push(['engagement', body]), ok(body)),
  saveEngagementBatch: async (body: any) => (calls.push(['engagement-batch', body]), ok({ created: [], rejected: [] })),
  quickFollowUp: async (id: string, body: any) => (calls.push(['quick-follow-up', id, body]), ok({ id, ...body })),
  updateEngagementExecution: async (id: string, body: any) => (calls.push(['engagement-execution', id, body]), ok({ id, ...body })),
  linkEngagementOrder: async (id: string, body: any) => (calls.push(['engagement-order', id, body]), ok({ id, ...body })),
  saveReview: async (body: any) => (calls.push(['review', body]), ok(body)),
};
const allow: express.RequestHandler = (req: any, _res, next) => { req.currentUser = actor; next(); };
const authenticatedOnly: express.RequestHandler = (req: any, _res, next) => {
  calls.push(['authenticated-gate', req.path]);
  req.currentUser = actor;
  next();
};
const app = express();
app.use(express.json());
app.use('/api/academy', createAcademyRouter({
  service,
  requireAuthenticated: authenticatedOnly,
  requireDashboardRead: gate('dashboard-read'),
  requireCourseListRead: gate('course-read'),
  requireCourseManageRead: gate('course-read'),
  requireSopTemplateRead: gate('course-read'),
  requireSessionRead: gate('session-read'),
  requireSessionDetailRead: gate('session-detail-read'),
  requireCourseWrite: allow,
  requireArrangementWrite: allow,
  requireSessionWrite: allow,
  requireTaskWrite: allow,
  requireEngagementWrite: allow,
  requireReviewWrite: allow,
}));
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address() as AddressInfo;
const base = `http://127.0.0.1:${address.port}/api/academy`;

try {
  const dashboard = await fetch(`${base}/dashboard`);
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).data.activeCourses, 2);
  assert.ok(calls.some((call) => call[0] === 'gate' && call[1] === 'dashboard-read' && call[2] === '/dashboard'));

  const publicCalendar = await fetch(`${base}/public-calendar?start=2026-08-10T00%3A00%3A00.000Z&end=2026-08-17T00%3A00%3A00.000Z`);
  assert.equal(publicCalendar.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'public-calendar'), [
    'public-calendar',
    { start: '2026-08-10T00:00:00.000Z', end: '2026-08-17T00:00:00.000Z' },
    actor.id,
  ]);
  assert.ok(calls.some((call) => call[0] === 'authenticated-gate' && call[1] === '/public-calendar'), '全员周历必须只要求已登录，不得绑定商学院页面权限');

  const myTasks = await fetch(`${base}/my-tasks?page=2&pageSize=20&status=OPEN`);
  assert.equal(myTasks.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'my-tasks'), [
    'my-tasks',
    { page: 2, pageSize: 20, search: '', status: 'OPEN' },
    actor.id,
  ]);
  assert.ok(calls.some((call) => call[0] === 'authenticated-gate' && call[1] === '/my-tasks'), '本人待办必须只要求已登录');

  const courses = await fetch(`${base}/courses?page=2&pageSize=20&search=AI&status=ACTIVE`);
  assert.equal(courses.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'courses')?.[1], { page: 2, pageSize: 20, search: 'AI', status: 'ACTIVE' });
  assert.ok(calls.some((call) => call[0] === 'gate' && call[1] === 'course-read' && call[2] === '/courses'));

  const categories = await fetch(`${base}/course-categories`);
  assert.equal(categories.status, 200);
  assert.equal((await categories.json()).data[0].name, '公开课');

  const templates = await fetch(`${base}/sop-templates`);
  assert.equal(templates.status, 200);
  const deletedTemplate = await fetch(`${base}/sop-templates/sop-1`, { method: 'DELETE' });
  assert.equal(deletedTemplate.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'delete-sop-template'), ['delete-sop-template', 'sop-1']);

  const savedCategory = await fetch(`${base}/course-categories`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '老板增长课' }) });
  assert.equal(savedCategory.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'save-course-category'), ['save-course-category', { name: '老板增长课' }]);

  const created = await fetch(`${base}/courses`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'A1' }) });
  assert.equal(created.status, 201);

  const updated = await fetch(`${base}/courses/course-1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '新课程' }) });
  assert.equal(updated.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'update-course'), ['update-course', 'course-1', { title: '新课程' }]);

  const activated = await fetch(`${base}/courses/course-1/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'ACTIVE' }) });
  assert.equal(activated.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'course-status'), ['course-status', 'course-1', 'ACTIVE']);

  const assets = await fetch(`${base}/courses/course-1/assets`);
  assert.equal(assets.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'course-assets'), ['course-assets', 'course-1']);

  const savedAsset = await fetch(`${base}/courses/course-1/assets`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetType: 'PPT', attachments: [{ id: 'a1' }] }) });
  assert.equal(savedAsset.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'save-course-asset')?.slice(0, 3), ['save-course-asset', 'course-1', { assetType: 'PPT', attachments: [{ id: 'a1' }] }]);

  const detail = await fetch(`${base}/sessions/session-1`);
  assert.equal(detail.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'session-detail'), ['session-detail', 'session-1']);
  assert.ok(calls.some((call) => call[0] === 'gate' && call[1] === 'session-detail-read' && call[2] === '/sessions/session-1'));
  const updatedSession = await fetch(`${base}/sessions/session-1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '调整课程安排' }) });
  assert.equal(updatedSession.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'update-session'), ['update-session', 'session-1', { title: '调整课程安排' }]);
  await fetch(`${base}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '普通排期', isHistoricalBackfill: true }) });
  assert.deepEqual(calls.filter((call) => call[0] === 'create-session').slice(-1)[0], ['create-session', { title: '普通排期' }], '普通排期端点必须剥离客户端伪造的历史补录标记');
  await fetch(`${base}/sessions/historical`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '历史课程' }) });
  assert.deepEqual(calls.filter((call) => call[0] === 'create-session').slice(-1)[0], ['create-session', { title: '历史课程', isHistoricalBackfill: true }], '历史补录只能通过独立端点注入可信标记');

  const nextStep = await fetch(`${base}/sessions/session-1/next-step`);
  assert.equal(nextStep.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'next-step'), ['next-step', 'session-1']);
  assert.ok(calls.some((call) => call[0] === 'gate' && call[1] === 'session-read' && call[2] === '/sessions/session-1/next-step'));

  const status = await fetch(`${base}/sessions/session-1/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'READY' }) });
  assert.equal(status.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'status'), ['status', 'session-1', 'READY']);

  const linked = await fetch(`${base}/engagements/engagement-1/order`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: 'order-1', orderNo: 'ORD-1' }) });
  assert.equal(linked.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'engagement-order'), ['engagement-order', 'engagement-1', { orderId: 'order-1', orderNo: 'ORD-1' }]);

  const batch = await fetch(`${base}/engagements/batch`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'session-1', customerIds: ['customer-1'] }) });
  assert.equal(batch.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'engagement-batch'), ['engagement-batch', { sessionId: 'session-1', customerIds: ['customer-1'] }]);

  const followUp = await fetch(`${base}/engagements/engagement-1/follow-up`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: '已沟通', courseAssessment: 'A' }) });
  assert.equal(followUp.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'quick-follow-up'), ['quick-follow-up', 'engagement-1', { content: '已沟通', courseAssessment: 'A' }]);

  const execution = await fetch(`${base}/engagements/engagement-1/execution`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attendanceStatus: 'ATTENDED', courseAssessment: 'A' }) });
  assert.equal(execution.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'engagement-execution'), ['engagement-execution', 'engagement-1', { attendanceStatus: 'ATTENDED', courseAssessment: 'A' }]);

  const taskAttachments = await fetch(`${base}/tasks/task-1/attachments`);
  assert.equal(taskAttachments.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'task-attachments'), ['task-attachments', 'task-1', actor.id]);
  const replacedTaskAttachments = await fetch(`${base}/tasks/task-1/attachments`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attachmentIds: ['attachment-1'] }) });
  assert.equal(replacedTaskAttachments.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'replace-task-attachments'), ['replace-task-attachments', 'task-1', { attachmentIds: ['attachment-1'] }, actor.id]);
  assert.ok(calls.filter((call) => call[0] === 'authenticated-gate' && call[1] === '/tasks/task-1/attachments').length >= 2, '任务附件路由只要求已登录，细粒度权限由服务层实时判定');
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

const viewOnlyUser: any = {
  ...actor,
  permissions: [{ module: PERMISSION_KEYS.ACADEMY_VIEW, actions: ['read'] }],
};
const viewOnlyAuth: any = {
  getCurrentUser: async () => ok(viewOnlyUser),
};
const permissionApp = express();
permissionApp.use(express.json());
permissionApp.use('/api/academy', createAcademyRouter({
  service,
  requireAuthenticated: createRequireAuth(viewOnlyAuth),
  requireDashboardRead: createRequireAnyPermission(viewOnlyAuth, [
    PERMISSION_KEYS.ACADEMY_PLAN_MANAGE,
    PERMISSION_KEYS.ACADEMY_COURSE_MANAGE,
    PERMISSION_KEYS.ACADEMY_SESSION_MANAGE,
    PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE,
    PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE,
  ]),
  requireCourseListRead: createRequireAnyPermission(viewOnlyAuth, [
    PERMISSION_KEYS.ACADEMY_COURSE_MANAGE,
    PERMISSION_KEYS.ACADEMY_PLAN_MANAGE,
    PERMISSION_KEYS.ACADEMY_SESSION_MANAGE,
  ]),
  requireCourseManageRead: createRequireAuth(viewOnlyAuth, PERMISSION_KEYS.ACADEMY_COURSE_MANAGE),
  requireSopTemplateRead: createRequireAnyPermission(viewOnlyAuth, [
    PERMISSION_KEYS.ACADEMY_COURSE_MANAGE,
    PERMISSION_KEYS.ACADEMY_PLAN_MANAGE,
    PERMISSION_KEYS.ACADEMY_SESSION_MANAGE,
  ]),
  requireSessionRead: createRequireAnyPermission(viewOnlyAuth, [
    PERMISSION_KEYS.ACADEMY_PLAN_MANAGE,
    PERMISSION_KEYS.ACADEMY_SESSION_MANAGE,
    PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE,
    PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE,
  ]),
  requireSessionDetailRead: createRequireAnyPermission(viewOnlyAuth, [
    PERMISSION_KEYS.ACADEMY_PLAN_MANAGE,
    PERMISSION_KEYS.ACADEMY_SESSION_MANAGE,
    PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE,
    PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE,
  ]),
  requireCourseWrite: allow,
  requireArrangementWrite: allow,
  requireSessionWrite: allow,
  requireTaskWrite: allow,
  requireEngagementWrite: allow,
  requireReviewWrite: allow,
}));
const permissionListener = permissionApp.listen(0, '127.0.0.1');
await once(permissionListener, 'listening');
const permissionBase = `http://127.0.0.1:${(permissionListener.address() as AddressInfo).port}/api/academy`;
try {
  assert.equal((await fetch(`${permissionBase}/public-calendar`)).status, 200, '仅工作台查看权员工仍可使用全员周历');
  assert.equal((await fetch(`${permissionBase}/my-tasks`)).status, 200, '仅工作台查看权员工仍可使用本人待办');
  for (const privatePath of ['/dashboard', '/courses', '/course-categories', '/courses/course-1/assets', '/sessions', '/sessions/session-1', '/sessions/session-1/next-step']) {
    assert.equal((await fetch(`${permissionBase}${privatePath}`)).status, 403, `仅工作台查看权不得读取私有子页资源: ${privatePath}`);
  }
} finally {
  await new Promise<void>((resolve, reject) => permissionListener.close((error) => error ? reject(error) : resolve()));
}

for (const permissionKey of [PERMISSION_KEYS.ACADEMY_PLAN_MANAGE, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE]) {
  const scopedAuth: any = {
    getCurrentUser: async () => ok({ ...actor, permissions: [{ module: permissionKey, actions: ['read', 'write'] }] }),
  };
  const scopedApp = express();
  scopedApp.use(express.json());
  scopedApp.use('/api/academy', createAcademyRouter({
    service,
    requireAuthenticated: createRequireAuth(scopedAuth),
    requireDashboardRead: createRequireAnyPermission(scopedAuth, [PERMISSION_KEYS.ACADEMY_PLAN_MANAGE, PERMISSION_KEYS.ACADEMY_COURSE_MANAGE, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE, PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE]),
    requireCourseListRead: createRequireAnyPermission(scopedAuth, [PERMISSION_KEYS.ACADEMY_COURSE_MANAGE, PERMISSION_KEYS.ACADEMY_PLAN_MANAGE, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE]),
    requireCourseManageRead: createRequireAuth(scopedAuth, PERMISSION_KEYS.ACADEMY_COURSE_MANAGE),
    requireSopTemplateRead: createRequireAnyPermission(scopedAuth, [PERMISSION_KEYS.ACADEMY_COURSE_MANAGE, PERMISSION_KEYS.ACADEMY_PLAN_MANAGE, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE]),
    requireSessionRead: createRequireAnyPermission(scopedAuth, [PERMISSION_KEYS.ACADEMY_PLAN_MANAGE, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE, PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE]),
    requireSessionDetailRead: createRequireAnyPermission(scopedAuth, [PERMISSION_KEYS.ACADEMY_PLAN_MANAGE, PERMISSION_KEYS.ACADEMY_SESSION_MANAGE, PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE, PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE]),
    requireCourseWrite: allow,
    requireArrangementWrite: allow,
    requireSessionWrite: allow,
    requireTaskWrite: allow,
    requireEngagementWrite: allow,
    requireReviewWrite: allow,
  }));
  const scopedListener = scopedApp.listen(0, '127.0.0.1');
  await once(scopedListener, 'listening');
  const scopedBase = `http://127.0.0.1:${(scopedListener.address() as AddressInfo).port}/api/academy`;
  try {
    assert.equal((await fetch(`${scopedBase}/courses`)).status, 200, `${permissionKey} 需读取课程选择列表以新建课程安排`);
    assert.equal((await fetch(`${scopedBase}/sessions/session-1`)).status, 200, `${permissionKey} 需读取课程安排详情`);
    assert.equal((await fetch(`${scopedBase}/course-categories`)).status, 403, `${permissionKey} 不得获得课程库管理权`);
  } finally {
    await new Promise<void>((resolve, reject) => scopedListener.close((error) => error ? reject(error) : resolve()));
  }
}

console.log('academy routes tests passed');
