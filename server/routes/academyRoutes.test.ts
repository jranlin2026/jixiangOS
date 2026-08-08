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
  listCourses: async (query: any) => (calls.push(['courses', query]), ok({ items: [], total: 21, page: query.page, pageSize: query.pageSize })),
  listSessions: async (query: any) => (calls.push(['sessions', query]), ok({ items: [], total: 0, page: query.page, pageSize: query.pageSize })),
  createCourse: async (body: any) => (calls.push(['create-course', body]), ok({ id: 'course-1' })),
  changeCourseStatus: async (id: string, status: string) => (calls.push(['course-status', id, status]), ok({ id, status })),
  createSession: async (body: any) => (calls.push(['create-session', body]), ok({ id: 'session-1' })),
  getSessionDetail: async (id: string) => (calls.push(['session-detail', id]), ok({ id, tasks: [], engagements: [], review: null })),
  changeSessionStatus: async (id: string, status: string) => (calls.push(['status', id, status]), ok({ id, status })),
  updateTask: async (id: string, body: any) => (calls.push(['task', id, body]), ok({ id, ...body })),
  saveEngagement: async (body: any) => (calls.push(['engagement', body]), ok(body)),
  saveReview: async (body: any) => (calls.push(['review', body]), ok(body)),
};
const allow: express.RequestHandler = (req: any, _res, next) => { req.currentUser = actor; next(); };
const app = express();
app.use(express.json());
app.use('/api/academy', createAcademyRouter({ service, requireRead: allow, requireCourseWrite: allow, requireSessionWrite: allow, requireEngagementWrite: allow, requireReviewWrite: allow }));
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

  const created = await fetch(`${base}/courses`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'A1' }) });
  assert.equal(created.status, 201);

  const activated = await fetch(`${base}/courses/course-1/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'ACTIVE' }) });
  assert.equal(activated.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'course-status'), ['course-status', 'course-1', 'ACTIVE']);

  const detail = await fetch(`${base}/sessions/session-1`);
  assert.equal(detail.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'session-detail'), ['session-detail', 'session-1']);

  const status = await fetch(`${base}/sessions/session-1/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'READY' }) });
  assert.equal(status.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === 'status'), ['status', 'session-1', 'READY']);
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

console.log('academy routes tests passed');
