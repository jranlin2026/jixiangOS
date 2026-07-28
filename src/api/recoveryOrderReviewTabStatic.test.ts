import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../pages/AfterSales/index.tsx', import.meta.url), 'utf8');
const tabSource = readFileSync(new URL('../pages/AfterSales/RecoveryOrderTab.tsx', import.meta.url), 'utf8');

assert.match(
  source,
  /value:\s*'recovery-review'[\s\S]*?permissionKeys:\s*\[PERMISSION_KEYS\.AFTER_SALES_RECOVERY_REVIEW_LIST\]/,
  '审核台入口必须由独立的售后挽回订单审核列表权限控制',
);

assert.match(
  tabSource,
  /canReviewRecoveryOrders\(currentUser\)/,
  '审核操作按钮必须使用登录用户的明确写权限，不能读取浏览器角色缓存',
);

assert.match(
  tabSource,
  /const canCreate = hasPermission\(currentUser, PERMISSION_KEYS\.AFTER_SALES_RECOVERY_CREATE, 'write'\);/,
  '审核台必须按新增售后挽回订单写权限判断创建与重提能力。',
);
assert.match(
  tabSource,
  /const canResubmitReturnedOrder = useCallback\(\(row: RecoveryOrder\) => \(\s*row\.status === '退回修改'\s*&& canCreate[\s\S]*?row\.createdBy === currentUser\?\.id\s*\), \[canCreate, currentUser\]\);/,
  '审核台仅允许仍有创建写权限的原创建人重提退回修改记录。',
);
assert.doesNotMatch(
  tabSource,
  /\['退回修改', '审核驳回'\]\.includes\(row\.status\)[\s\S]{0,500}修改并重新提交/,
  '审核驳回记录不得显示修改并重新提交入口。',
);
assert.match(
  tabSource,
  /const \[reviewSubmitting, setReviewSubmitting\] = useState\(false\);/,
  '售后审核提交必须有明确的提交中状态。',
);
assert.match(tabSource, /const reviewSubmittingRef = React\.useRef\(false\);/, '售后审核必须有同步防双击锁。');
assert.match(tabSource, /if \(!currentUser \|\| !reviewAction \|\| reviewSubmittingRef\.current\) return;/, '售后审核必须同步阻止重复提交。');
assert.match(tabSource, /审核驳回.*终止.*不能修改或重新提交/, '驳回成功反馈必须说明终态与不可重提。');

const reviewSubmit = tabSource.match(/const handleReviewSubmit = async \(\) => \{([\s\S]*?)\n  \};\n\n  const renderCell/)?.[1];
assert.ok(reviewSubmit, '售后审核台必须保留审核提交处理。');
assert.match(reviewSubmit, /reviewSubmittingRef\.current = true;\s*setReviewSubmitting\(true\);/, '提交开始时必须立即加同步锁并进入提交中状态。');
assert.match(reviewSubmit, /try \{[\s\S]*?\} catch \(error\) \{[\s\S]*?setReviewError\([\s\S]*?\);[\s\S]*?\} finally \{[\s\S]*?reviewSubmittingRef\.current = false;[\s\S]*?setReviewSubmitting\(false\);[\s\S]*?\}/, '网络异常必须写入原审核弹窗，并在 finally 中解除提交锁。');
assert.doesNotMatch(reviewSubmit, /showErrorDialog\(/, '审核失败不得叠加第二个错误 Dialog。');
assert.doesNotMatch(reviewSubmit, /setMessage\(/, '审核成功不得同时触发通用成功提示与专用结果窗。');
assert.match(reviewSubmit, /action\.type === 'approve'[\s\S]*?setApprovedOrder\(nextOrder\)[\s\S]*?setReviewOutcome\(\{ type: action\.type, row: nextOrder \}\)/, '通过应使用专用结果窗；退回和驳回应复用审核弹窗显示结果。');
assert.match(tabSource, /onClose=\{reviewSubmitting \? undefined : closeReviewDialog\}/, '提交中不得通过遮罩关闭审核弹窗。');
assert.match(tabSource, /disableEscapeKeyDown=\{reviewSubmitting\}/, '提交中必须禁用 Escape 关闭审核弹窗。');
assert.match(tabSource, /closeDisabled=\{reviewSubmitting\}/, '提交中必须禁用审核弹窗关闭按钮。');
assert.match(tabSource, /<Button onClick=\{closeReviewDialog\} disabled=\{reviewSubmitting\}>取消<\/Button>/, '提交中必须禁用取消。');
assert.match(tabSource, /disabled=\{reviewSubmitting \|\| \(\(reviewAction\?\.type === 'return' \|\| reviewAction\?\.type === 'reject'\) && !reviewReason\.trim\(\)\)\}/, '提交中必须禁用确认。');
assert.match(tabSource, /disabled=\{reviewSubmitting\}[\s\S]*?multiline/, '提交中必须禁用原因输入。');
assert.match(tabSource, />继续审核<\/Button>/, '审核结果窗必须提供继续审核按钮。');
assert.match(tabSource, /<Dialog open=\{Boolean\(approvedOrder\)\}/, '审核通过必须保留专用结果窗。');
assert.match(tabSource, /hasPermission\(currentUser, PERMISSION_KEYS\.FINANCE_RECOVERY_SETTLEMENT, 'read'\)[\s\S]*?去售后挽回分账/, '仅有售后挽回分账读取权限时才显示分账跳转。');
