import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const ruleConfigSource = readFileSync(
  join(projectRoot, 'src/pages/Commission/CommissionRuleConfig.tsx'),
  'utf8',
);
const commissionPageSource = readFileSync(
  join(projectRoot, 'src/pages/Commission/index.tsx'),
  'utf8',
);

assert.match(
  ruleConfigSource,
  /aria-label=\{`查看\$\{plan\.name\}历史版本`\}/,
  '提成方案列表必须提供可访问的历史版本入口',
);
assert.match(
  ruleConfigSource,
  /变更内容/,
  '历史版本弹窗必须展示版本变更内容',
);
assert.match(
  ruleConfigSource,
  /当前只有初始版本/,
  '只有 v1 时必须明确说明后续修改才会产生历史版本',
);
assert.doesNotMatch(
  ruleConfigSource,
  /<Chip label=\{`v\$\{plan\.version \|\| 1\}`\}/,
  '提成方案主列表不得重复展示无意义的 v1 标签',
);
assert.match(
  commissionPageSource,
  /label: '方案版本'/,
  '提成计算详情必须显示实际使用的方案版本',
);
