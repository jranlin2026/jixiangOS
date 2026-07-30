import assert from 'node:assert/strict';
import express from 'express';
import { createBusinessCockpitRouter, parseBusinessCockpitRange } from './businessCockpitRoutes';

assert.deepEqual(parseBusinessCockpitRange({ preset: 'month' }), { preset: 'month' });
assert.deepEqual(
  parseBusinessCockpitRange({ preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' }),
  { preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' },
);

assert.throws(
  () => parseBusinessCockpitRange({ preset: 'custom', startDate: '2026-07-31' }),
  /自定义时间必须同时选择开始和结束日期/,
);
assert.throws(
  () => parseBusinessCockpitRange({ preset: 'custom', startDate: '2026-08-01', endDate: '2026-07-31' }),
  /开始日期不能晚于结束日期/,
);
assert.throws(
  () => parseBusinessCockpitRange({ preset: 'quarter' }),
  /不支持的统计范围/,
);

{
  const app = express();
  app.use('/dashboard', createBusinessCockpitRouter({
    requireAuth: (req, _res, next) => {
      (req as any).currentUser = { id: 'admin', name: '管理员' };
      next();
    },
    service: {
      async get() {
        throw new Error('database offline');
      },
    },
  }));
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/dashboard/business-cockpit?preset=month`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      code: 500,
      data: null,
      message: '驾驶舱数据加载失败',
    });
  } finally {
    server.close();
  }
}

console.log('business cockpit route tests passed');
