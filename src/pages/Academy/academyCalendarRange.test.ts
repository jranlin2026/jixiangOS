import assert from "node:assert/strict";

process.env.TZ = "Asia/Shanghai";

const localNow = new Date("2026-08-12T12:00:00+08:00");
const start = new Date(localNow);
const weekday = start.getDay() || 7;
start.setDate(start.getDate() - weekday + 1);
start.setHours(0, 0, 0, 0);
const end = new Date(start);
end.setDate(start.getDate() + 7);

assert.equal(start.toISOString(), "2026-08-09T16:00:00.000Z", "周历开始应对齐上海时区周一0点");
assert.equal(end.toISOString(), "2026-08-16T16:00:00.000Z", "周历结束应为下周一0点的开区间端点");

console.log("academy calendar range tests passed");
