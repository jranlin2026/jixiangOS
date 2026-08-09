import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/pages/BrowserAgentConnect/index.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const login = readFileSync('src/pages/Login/index.tsx', 'utf8');

assert.match(app, /path="\/browser-agent\/connect"/, 'OS必须提供浏览器员工授权连接页');
assert.match(page, /browser-agent\/auth\/authorize/, '连接页必须通过后端创建受控授权码');
assert.match(page, /线索-新建线索/, '无新建线索权限时必须给出明确提示');
assert.match(login, /requestedLocation\.search/, '登录后必须带回授权页的完整查询参数');

console.log('browser agent OS authorization page: ok');
