import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createAcademyRouter } from './academyRoutes';

const actor: any = { id: 'u1', name: '运营员', isActive: true, permissions: [] };
const calls: any[] = [];
const ok = (data: unknown) => ({ code: 0, data, message: 'success' });
const service: any = {
  getDashboard: async (current: any) => (calls.push(['dashboard', current.id]), ok({ activeCourses: 2 })),
  listCourseCategories: async () => (calls.push(['course-categories']), ok([{ id: 'category-1', name: '公开课' }])),
  saveCourseCategory: async (body: any) => (calls.push(['save-course-category', body]), ok({ id: 'category-2', ...body })),
  listCourses: async (query: any) => (calls.push(['courses', query]), ok({ items: [], total: 21, page: query.page, pageSize: query.pageSize })),
  listSessions: async (query: any) => (calls.push(['sessions', query]), ok({ items: [], total: 0, page: query.page, pageSize: query.pageSize })),
  createCourse: async (body: any) => (calls.push(['create-course', body]), ok({ id: 'course-1' })),
  updateCourse: async (id: string, body: any) => (calls.push(['update-course', id, body]), ok({ id, ...body })),
  changeCourseStatus: async (id: string, status: string) => (calls.push(['course-status', id, status]), ok({ id, status })),
  listCourseAssets: async (id: string) => (calls.push(['course-assets', id]), ok([])),
  saveCourseAsset: async (id: string, body: any) => (calls.push(['save-course-asset', id, body]), ok({ id: 'asset-1', courseId: id, ...body })),
  createSession: async (body: any) => (calls.push(['create-session', body]), ok({ id: 'session-1' })),
  getSessionDetail: async (id: string) => (calls.push(['session-detail', id]), ok({ id, tasks: [], engagements: [], review: null })),
  changeSessionStatus: async (id: string, status: string) => (calls.push(['status', id, status]), ok({ id, status })),
  updateTask: async (id: string, body: any) => (calls.push(['task', id, body]), ok({ id, ...body })),
  saveEngagement: async (body: any) => (calls.push(['engagement', body]), ok(body)),
  updateEngagementExecution: async (id: string, body: any) => (calls.push(['engagement-execution', id, body]), ok({ id, ...body })),
  linkEngagementOrder: async (id: string, body: any) => (calls.push(['engagement-order', id, body]), ok({ id, ...body })),
  saveReview: async (body: any) => (calls.push(['review', body]), ok(body)),
};
const allow: express.RequestHandler = (req: any, _res, next) => { req.currentUser = actor; next(); };
const app = express();
app.use(express.json());
app.use('/api/academy', createAcademyRouter({ service, requireRead: allow, requireCourseWrite: allow, requireArrangementWrite: allow, requireSessionWrite: allow, requireTaskWrite: allow, requireEngagementWrite: allow, requireReviewWrite: allow }));
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address() as AddressInfo;
const base = `http://127.0.0.1:${address.port}/api/academy`;

try {
  const dashboard = await fetch(`${base}/dashboard`);
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).data.activeCourses, 2);

  const courses = await fetch(`${base}/courses?page=2&pageSize=20&search=AI&status=ACTIVE`);
  assert.equal(courses.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'courses')?.[1], { page: 2, pageSize: 20, search: 'AI', status: 'ACTIVE' });

  const categories = await fetch(`${base}/course-categories`);
  assert.equal(categories.status, 200);
  assert.equal((await categories.json()).data[0].name, '公开课');

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

  const status = await fetch(`${base}/sessions/session-1/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'READY' }) });
  assert.equal(status.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'status'), ['status', 'session-1', 'READY']);

  const linked = await fetch(`${base}/engagements/engagement-1/order`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: 'order-1', orderNo: 'ORD-1' }) });
  assert.equal(linked.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'engagement-order'), ['engagement-order', 'engagement-1', { orderId: 'order-1', orderNo: 'ORD-1' }]);

  const execution = await fetch(`${base}/engagements/engagement-1/execution`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attendanceStatus: 'ATTENDED', courseAssessment: 'A' }) });
  assert.equal(execution.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'engagement-execution'), ['engagement-execution', 'engagement-1', { attendanceStatus: 'ATTENDED', courseAssessment: 'A' }]);
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

console.log('academy routes tests passed');
