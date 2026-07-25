import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Customers/CustomerTagFilter.tsx'), 'utf8');

assert.match(source, /customerApi\.fetchCustomerTagFacets\(scope\)/, '标签数量应按当前客户列表范围和权限加载');
assert.match(source, /label={`\$\{tag\.name\}（\$\{facetCounts\.get\(tag\.id\) \|\| 0\}）`}/, '标签按钮应展示当前列表可见数量');
assert.match(source, />匹配规则</, '原有匹配逻辑应收纳为清晰的分组');
assert.match(source, /按分组筛选（推荐）/);
assert.match(source, /满足任一标签/);
assert.match(source, /满足全部标签/);
assert.match(source, /当前规则：{matchRuleHint}/, '应实时解释当前匹配规则');
assert.match(source, /aria-pressed={isSelected}/, '可多选标签应暴露选中状态');
assert.match(source, />特殊筛选</, '无标签和缺失分组筛选应使用与标签一致的分组布局');
assert.match(source, /label="无人工标签"/, '应保留无人工标签筛选');
assert.match(source, /label={`未设置：\$\{group\.name\}`}/, '应将未设置分组改为可直接点击的按钮');
assert.doesNotMatch(source, /<RadioGroup|<FormControl|<Select/, '筛选面板不应再混用笨重的表单控件');
