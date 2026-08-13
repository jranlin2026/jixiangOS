import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { createOkrRouter } from "./okrRoutes";

const actor: any = {
  id: "u1",
  name: "员工甲",
  isActive: true,
  permissions: [],
};
const calls: any[] = [];
const ok = (data: any) => ({ code: 0, data, message: "success" });
const service: any = {
  listAssignableUsers: async (current: any) => (
    calls.push(["directory", current.id]),
    ok([{ id: "u1", name: "员工甲" }])
  ),
  listAlignmentObjectives: async (current: any, query: any) => (
    calls.push(["alignment-directory", current.id, query]),
    ok([{ id: "company-o", title: "公司目标", scope: "COMPANY" }])
  ),
  listCycles: async (current: any, query: any) => (
    calls.push(["list-cycles", current.id, query]),
    ok({ items: [], total: 0, page: query.page, pageSize: query.pageSize })
  ),
  createCycle: async (current: any, body: any) => (
    calls.push(["create-cycle", current.id, body]),
    ok({ id: "cycle-1" })
  ),
  transitionCycle: async (current: any, id: string, status: string) => (
    calls.push(["transition", current.id, id, status]),
    ok({ id, status })
  ),
  listObjectives: async (current: any, query: any) => (
    calls.push(["list-objectives", current.id, query]),
    ok({ items: [], total: 0, page: query.page, pageSize: query.pageSize })
  ),
  listDueCheckIns: async (current: any, query: any) => (
    calls.push(["due-check-ins", current.id, query]),
    ok({ items: [], total: 0, page: query.page, pageSize: query.pageSize })
  ),
  createObjective: async (current: any, body: any) => (
    calls.push(["create-objective", current.id, body]),
    ok({ id: "objective-1" })
  ),
  getObjective: async (current: any, id: string) => (
    calls.push(["get-objective", current.id, id]),
    ok({ id })
  ),
  updateObjective: async (current: any, id: string, body: any) => (
    calls.push(["update-objective", current.id, id, body]),
    ok({ id, ...body })
  ),
  addKeyResult: async (current: any, id: string, body: any) => (
    calls.push(["add-kr", current.id, id, body]),
    ok({ id: "kr-1" })
  ),
  checkIn: async (current: any, id: string, body: any) => (
    calls.push(["check-in", current.id, id, body]),
    ok({ id: "check-in-1" })
  ),
  submitReview: async (current: any, id: string, body: any) => (
    calls.push(["review", current.id, id, body]),
    ok({ id: "review-1" })
  ),
  listKeyResultTasks: async (current: any, id: string) => (
    calls.push(["list-tasks", current.id, id]),
    ok([])
  ),
  linkTask: async (current: any, id: string, body: any) => (
    calls.push(["link-task", current.id, id, body]),
    ok({ id: "link-1", taskId: body.taskId })
  ),
};
const metrics: any = {
  listCatalog: async (current: any) => (
    calls.push(["metric-catalog", current.id]),
    ok([{ code: "FORMAL_ORDER_COUNT" }])
  ),
  bind: async (current: any, id: string, body: any) => (
    calls.push(["metric-bind", current.id, id, body]),
    ok({ keyResultId: id, ...body })
  ),
  refresh: async (current: any, id: string) => (
    calls.push(["metric-refresh", current.id, id]),
    ok({ keyResultId: id })
  ),
};
const requireAuth: express.RequestHandler = (req: any, _res, next) => {
  req.currentUser = actor;
  next();
};
const app = express();
app.use(express.json());
app.use("/api/okr", createOkrRouter({ service, metrics, requireAuth }));
const listener = app.listen(0, "127.0.0.1");
await once(listener, "listening");
const base = `http://127.0.0.1:${(listener.address() as AddressInfo).port}/api/okr`;

try {
  const cycles = await fetch(`${base}/cycles?page=2&pageSize=25&status=ACTIVE`);
  assert.equal(cycles.status, 200);
  assert.deepEqual(calls.find((call) => call[0] === "list-cycles")?.[2], {
    page: 2,
    pageSize: 25,
    cycleId: "",
    scope: "",
    status: "ACTIVE",
    owner: "",
    health: "",
    search: "",
  });

  const createdCycle = await fetch(`${base}/cycles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "2026Q3" }),
  });
  assert.equal(createdCycle.status, 201);
  const activated = await fetch(`${base}/cycles/cycle-1/activate`, {
    method: "POST",
  });
  assert.equal(activated.status, 200);
  assert.deepEqual(
    calls.find((call) => call[0] === "transition"),
    ["transition", actor.id, "cycle-1", "ACTIVE"],
  );

  const objectives = await fetch(
    `${base}/objectives?cycleId=cycle-1&page=1&pageSize=10&owner=mine&health=AT_RISK&search=%E5%9B%9E%E6%AC%BE`,
  );
  assert.equal(objectives.status, 200);
  assert.equal(
    calls.find((call) => call[0] === "list-objectives")?.[2].owner,
    "mine",
  );
  assert.equal(
    calls.find((call) => call[0] === "list-objectives")?.[2].health,
    "AT_RISK",
  );
  assert.equal(
    calls.find((call) => call[0] === "list-objectives")?.[2].search,
    "回款",
  );

  const dueCheckIns = await fetch(
    `${base}/check-ins/due?cycleId=cycle-1&page=2&pageSize=10`,
  );
  assert.equal(dueCheckIns.status, 200);
  assert.deepEqual(
    calls.find((call) => call[0] === "due-check-ins"),
    [
      "due-check-ins",
      actor.id,
      {
        page: 2,
        pageSize: 10,
        cycleId: "cycle-1",
        scope: "",
        status: "",
        owner: "",
        health: "",
        search: "",
      },
    ],
  );

  const directory = await fetch(`${base}/directory/users`);
  assert.equal(directory.status, 200);
  assert.deepEqual((await directory.json()).data, [
    { id: "u1", name: "员工甲" },
  ]);

  const alignmentDirectory = await fetch(
    `${base}/directory/alignment-objectives?cycleId=cycle-1&childScope=INDIVIDUAL`,
  );
  assert.equal(alignmentDirectory.status, 200);
  assert.deepEqual(
    calls.find((call) => call[0] === "alignment-directory"),
    [
      "alignment-directory",
      actor.id,
      { cycleId: "cycle-1", childScope: "INDIVIDUAL" },
    ],
  );

  const checkIn = await fetch(`${base}/key-results/kr-1/check-ins`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentValue: 50 }),
  });
  assert.equal(checkIn.status, 201);
  assert.deepEqual(
    calls.find((call) => call[0] === "check-in"),
    ["check-in", actor.id, "kr-1", { currentValue: 50 }],
  );

  const taskLinks = await fetch(`${base}/key-results/kr-1/tasks`);
  assert.equal(taskLinks.status, 200);
  const linkedTask = await fetch(`${base}/key-results/kr-1/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId: "task-1" }),
  });
  assert.equal(linkedTask.status, 201);
  assert.deepEqual(
    calls.find((call) => call[0] === "link-task"),
    ["link-task", actor.id, "kr-1", { taskId: "task-1" }],
  );

  const catalog = await fetch(`${base}/metrics/catalog`);
  assert.equal(catalog.status, 200);
  const metricBinding = await fetch(`${base}/key-results/kr-1/metric-binding`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ metricCode: "FORMAL_ORDER_COUNT" }),
  });
  assert.equal(metricBinding.status, 201);
  const refreshedMetric = await fetch(
    `${base}/key-results/kr-1/metric-refresh`,
    { method: "POST" },
  );
  assert.equal(refreshedMetric.status, 200);
  assert.deepEqual(
    calls.find((call) => call[0] === "metric-bind"),
    ["metric-bind", actor.id, "kr-1", { metricCode: "FORMAL_ORDER_COUNT" }],
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
}
