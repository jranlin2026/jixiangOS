import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { moveScriptItem, resolveRecommendedScriptId, setRecommendedScript } from './browserScriptLibraryModel';
import type { BrowserScriptTemplate } from '../../types/browserAgent';

const root = process.cwd();
const settings = readFileSync(resolve(root, 'src/pages/Settings/index.tsx'), 'utf8');
const sidebar = readFileSync(resolve(root, 'src/layouts/Sidebar.tsx'), 'utf8');
const api = readFileSync(resolve(root, 'src/api/browserAgentConfigApi.ts'), 'utf8');
const page = readFileSync(resolve(root, 'src/pages/Settings/BrowserScriptLibraryConfig.tsx'), 'utf8');

assert.match(settings, /key: 'aiEmployee'[\s\S]*key: 'scriptLibrary'/);
assert.match(sidebar, /label: 'AI员工设置'[\s\S]*group=aiEmployee/);
assert.match(api, /getScriptLibrary:[\s\S]*saveScriptLibrary:/);
assert.match(page, /浏览器客服话术/);
assert.match(page, /设为推荐/);
assert.match(page, /上移/);
assert.match(page, /下移/);
assert.match(page, /data-testid="script-action-toolbar" direction="row"/, '话术操作区必须保持横向排列');
assert.doesNotMatch(page, /direction=\{\{ xs: 'row', sm: 'column' \}\}/, '话术操作区不得在桌面端变成竖列');
assert.doesNotMatch(page, /话术标题/);
assert.doesNotMatch(page, /优先级/);
assert.doesNotMatch(page, /推荐条件/);
assert.doesNotMatch(page, /订单状态/);
assert.doesNotMatch(page, /商品关键词/);
assert.doesNotMatch(page, /联系方式状态/);
assert.match(page, /saveScriptLibrary\(library\)/, '保存排序和推荐时必须保留旧话术标题与隐藏兼容字段');
assert.match(page, /disabled={!script\.enabled}/, '停用话术不能被设为推荐');

const scripts: BrowserScriptTemplate[] = [{
  id: 'one', title: '保留标题一', content: '内容一', enabled: true, sortOrder: 10, priority: 1,
  match: { orderStatuses: ['已付款'], productKeywords: ['产品A'], contactState: 'PRESENT' },
}, {
  id: 'two', title: '保留标题二', content: '内容二', enabled: true, sortOrder: 20, priority: 0,
  match: { orderStatuses: [], productKeywords: [], contactState: 'ANY' },
}];
const recommended = setRecommendedScript(scripts, 'two');
assert.equal(resolveRecommendedScriptId(recommended), 'two');
assert.equal(recommended.filter((script) => script.priority > 0).length, 1);
assert.equal(recommended[0].title, '保留标题一');
assert.deepEqual(recommended[0].match, scripts[0].match, '设为推荐不得改写隐藏兼容字段');
assert.deepEqual(moveScriptItem(recommended, 'two', -1).map((script) => [script.id, script.sortOrder]), [['two', 10], ['one', 20]]);

console.log('browser script library settings contract tests passed');
