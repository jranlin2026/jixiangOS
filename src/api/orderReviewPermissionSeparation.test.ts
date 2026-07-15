import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const permissionsSource = readFileSync(join(process.cwd(), 'src', 'shared', 'utils', 'permissions.ts'), 'utf8');
const ordersPageSource = readFileSync(join(process.cwd(), 'src', 'pages', 'Orders', 'index.tsx'), 'utf8');
const appSource = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
const dashboardSource = readFileSync(join(process.cwd(), 'src', 'api', 'dashboardApi.ts'), 'utf8');
const aiSource = readFileSync(join(process.cwd(), 'src', 'api', 'aiApi.ts'), 'utf8');

assert.match(
  permissionsSource,
  /ORDER_REVIEW_LIST:\s*'订单\/订单审核列表'[\s\S]*ORDER_REVIEW:\s*'订单\/订单审核操作'/,
  '订单审核列表和审核操作必须使用两个独立权限键',
);
assert.match(
  ordersPageSource,
  /PERMISSION_KEYS\.ORDER_REVIEW_LIST/,
  '订单审核台标签必须由订单审核列表权限控制',
);
assert.match(
  ordersPageSource,
  /visibleTabs\.map/,
  '订单列表和订单审核台必须根据各自权限渲染，而不是无条件显示',
);
assert.match(
  appSource,
  /PERMISSION_KEYS\.ORDER_REVIEW_LIST/,
  '订单模块路由必须允许审核列表角色进入，同时不依赖审核操作权限',
);
assert.match(
  appSource,
  /PERMISSION_KEYS\.ORDER_MANAGE,[\s\S]{0,160}PERMISSION_KEYS\.ORDER_REVIEW_LIST,[\s\S]{0,160}PERMISSION_KEYS\.ORDER_CREATE/,
  '只有新增订单权限的角色也必须能进入订单模块提交申请',
);
assert.match(
  ordersPageSource,
  /visibleTabs\.length > 0/,
  '只有新增订单权限时不得回退渲染无权查看的订单列表',
);
assert.match(
  dashboardSource,
  /currentUserHasPermission\(PERMISSION_KEYS\.ORDER_REVIEW_LIST\)/,
  '首页待办和统计不得绕过订单审核列表权限读取申请数据',
);
assert.match(
  aiSource,
  /currentUserHasPermission\(PERMISSION_KEYS\.ORDER_REVIEW_LIST\)/,
  'AI 助手不得绕过订单审核列表权限读取申请数据',
);
