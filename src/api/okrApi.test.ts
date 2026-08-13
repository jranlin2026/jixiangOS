import assert from "node:assert/strict";
import { okrApi } from "./okrApi";

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
  configurable: true,
});

const requests: Array<{ url: string; init?: RequestInit }> = [];
globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  requests.push({ url: String(input), init });
  return new Response(
    JSON.stringify({
      code: 0,
      data: { items: [], total: 0, page: 3, pageSize: 20 },
      message: "success",
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}) as typeof fetch;

await okrApi.listObjectives({
  page: 3,
  pageSize: 20,
  cycleId: "cycle-1",
  owner: "team",
  search: "增长",
});
await okrApi.listDirectoryUsers();
await okrApi.listAlignmentObjectives({
  cycleId: "cycle-1",
  childScope: "INDIVIDUAL",
});
await okrApi.linkTask("kr-1", "task-123");
await okrApi.listMetrics();
await okrApi.bindMetric("kr-1", "FORMAL_ORDER_PAID_AMOUNT");
await okrApi.refreshMetric("kr-1");
await okrApi.listDueCheckIns({ page: 2, pageSize: 10, cycleId: "cycle-1" });

assert.equal(
  requests[0]?.url,
  "/api/okr/objectives?page=3&pageSize=20&cycleId=cycle-1&owner=team&search=%E5%A2%9E%E9%95%BF",
  "OKR列表必须把统一分页、周期、范围和搜索条件传给服务端",
);
assert.equal(
  requests[1]?.url,
  "/api/okr/directory/users",
  "负责人必须使用OKR数据范围裁剪的目录接口",
);
assert.equal(
  requests[2]?.url,
  "/api/okr/directory/alignment-objectives?cycleId=cycle-1&childScope=INDIVIDUAL",
);
assert.equal(
  requests[3]?.url,
  "/api/okr/key-results/kr-1/tasks",
  "KR应通过独立命令关联现有任务",
);
assert.equal(requests[3]?.init?.method, "POST");
assert.equal(requests[3]?.init?.body, JSON.stringify({ taskId: "task-123" }));
assert.equal(requests[4]?.url, "/api/okr/metrics/catalog");
assert.equal(requests[5]?.url, "/api/okr/key-results/kr-1/metric-binding");
assert.equal(
  requests[5]?.init?.body,
  JSON.stringify({ metricCode: "FORMAL_ORDER_PAID_AMOUNT" }),
);
assert.equal(requests[6]?.url, "/api/okr/key-results/kr-1/metric-refresh");
assert.equal(
  requests[7]?.url,
  "/api/okr/check-ins/due?page=2&pageSize=10&cycleId=cycle-1",
  "周检视必须服务端筛选后统一分页",
);

console.log("okr api pagination test passed");
