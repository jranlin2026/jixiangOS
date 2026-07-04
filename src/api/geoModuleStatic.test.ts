import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appSource = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
const sidebarSource = readFileSync(join(process.cwd(), 'src', 'layouts', 'Sidebar.tsx'), 'utf8');
const geoSource = readFileSync(join(process.cwd(), 'src', 'pages', 'GEO', 'index.tsx'), 'utf8');

assert.match(appSource, /ROUTES\.GEO/);
assert.match(sidebarSource, /GEO增长中心/);

[
  'GEO驾驶舱',
  'AI问题库',
  '品牌语料库',
  '产品语料库',
  '内容资产中心',
  'AI搜索监测',
  'GEO任务中心',
].forEach((label) => {
  assert.match(geoSource, new RegExp(label));
});

[
  '品牌提及率',
  '产品推荐率',
  '引用率',
  '描述错误',
  '竞品出现',
  '内容优化任务',
].forEach((label) => {
  assert.match(geoSource, new RegExp(label));
});
