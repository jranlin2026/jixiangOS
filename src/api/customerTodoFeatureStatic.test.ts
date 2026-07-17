import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

const schema = read('prisma/schema.prisma');
const server = read('server/index.ts');
const detail = read('src/pages/Customers/CustomerDetail.tsx');
const panel = read('src/shared/components/CustomerTodoPanel.tsx');

assert.match(detail, /customerApi\.fetchManageableUsers\(\)/, '客户详情必须使用客户专用可管理目录');
assert.doesNotMatch(detail, /settingsApi\.fetchAssignableUsers/);
assert.doesNotMatch(detail, /getScopedLeadAssignmentCandidates|leadFlowApi/, '客户详情不得从 lead-flow 或 localStorage 扩张人员上界');

assert.match(schema, /model CustomerTodo\s*\{/);
assert.match(server, /app\.get\('\/api\/customers\/:id\/todos'/);
assert.match(server, /app\.post\('\/api\/customers\/:id\/todos'/);
assert.match(server, /app\.post\('\/api\/customers\/:id\/todos\/:todoId\/complete'/);
assert.match(detail, /<Tab label="待办"/);
assert.match(detail, /<CustomerTodoPanel/);
assert.match(detail, /buildCustomerDetailPatch\(/, '资料保存必须构建差量且按权限分组的 patch');
assert.match(detail, /hasExplicitPermission\(currentUser,\s*PERMISSION_KEYS\.CUSTOMER_EDIT_ATTRIBUTION,\s*'write'\)/);
assert.match(detail, /hasExplicitPermission\(currentUser,\s*PERMISSION_KEYS\.CUSTOMER_SET_TODOS,\s*'write'\)/);
assert.match(detail, /if \(!detailActions\.actions\.addFollowUp\) return;/, '跟进 handler 必须同样 fail closed');
assert.match(detail, /\{detailActions\.actions\.addFollowUp\s*&&\s*\(/, '跟进控件必须同时满足 leaf 和 manage');
assert.match(detail, /canManageTodos=\{detailActions\.actions\.setTodos\}/);
assert.match(detail, /归属字段只读/, '缺少归属权限时需明确告知编辑人');
assert.match(
  detail,
  /const canOpenCustomerEditor\s*=\s*detailActions\.actions\.editProfile\s*\|\|\s*detailActions\.actions\.editAttribution/,
  '归属-only 角色必须能独立打开经 manageability 授权的编辑器',
);
assert.match(
  detail,
  /if \(readOnly \|\| profileSaving \|\| !canOpenCustomerEditor\) return;/,
  '归属-only 角色的保存 handler 必须可达，同时对不可管理客户 fail closed',
);
assert.match(detail, /canOpenCustomerEditor\s*&&\s*\(/, '编辑入口必须使用分组 leaf 与 manageability 的联合策略');
assert.match(
  detail,
  /renderInfoRow\('客户全名',\s*'name',\s*detailActions\.actions\.editProfile\)/,
  '归属-only 编辑器中 profile 组必须保持只读',
);
assert.match(detail, /if \(readOnly \|\| tagSaving \|\| !detailActions\.actions\.setTags\) return;/, '标签保存 handler 必须同时校验 leaf 与 manageability');
assert.match(detail, /detailActions\.actions\.setTags\s*&&\s*\(/, '标签按钮不得对仅可读贡献客户展示');
assert.equal(
  (detail.match(/if \(!detailActions\.actions\.release\) return;/g) || []).length,
  2,
  '打开与确认释放处理器都必须对仅可读客户 fail closed',
);
assert.match(detail, /detailActions\.actions\.release\s*&&\s*\(/, '释放按钮必须同时满足 leaf 和 manageability');
assert.match(panel, /canRunCustomerTodoAction\(/, '待办按钮必须按动作和执行人判定');
assert.match(panel, /canManageTodos/, '新建、编辑、取消和重开必须由管理权限控制');

console.log('customer todo feature static tests passed');
