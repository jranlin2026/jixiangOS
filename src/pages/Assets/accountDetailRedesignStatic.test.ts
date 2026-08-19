import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Assets/index.tsx'), 'utf8');

for (const section of [
  '账号身份',
  '登录与安全',
  '绑定关系',
  '归属与使用',
  '经营与状态',
  '身份账号关联',
]) {
  assert.match(source, new RegExp(`renderDetailCard\\('${section}'`), `互联网账号详情必须包含${section}分区`);
}

assert.match(source, /renderAccountSummaryCard/, '互联网账号详情必须提供顶部账号摘要');
assert.match(source, /PlatformBrandMark platform=\{account\.platform\} size=\{56\}/, '顶部摘要应使用56px平台品牌标识');
assert.match(source, /登录设备\s*\(\{accountLoginDevices\.length\}\)/, '绑定关系需要明确显示多登录设备数量');
assert.match(source, /此账号使用的身份账号/, '身份账号关联必须区分当前账号的上游身份账号');
assert.match(source, /使用此账号的业务账号/, '身份账号关联必须区分下游业务账号');
assert.match(source, /detail\?\.type === 'account' \? 1040 : 960/, '互联网账号详情应使用1040px桌面宽度');
assert.match(source, /label="✓"[\s\S]*display: \{ xs: 'inline-flex', sm: 'none' \}/, '窄屏保存反馈应使用紧凑标记，避免挤压标题操作区');
assert.match(source, /textOverflow: 'ellipsis'/, '详情标题在极窄视口应安全收缩而不是遮挡操作');
assert.doesNotMatch(source, /renderDetailCard\('账号基本信息'/, '不应继续将所有字段堆叠在单一账号基本信息卡片中');

console.log('account detail redesign static tests passed');
