import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/OrderReview/index.tsx'), 'utf8');
const recoverySource = readFileSync(join(process.cwd(), 'src/pages/AfterSales/RecoveryOrderTab.tsx'), 'utf8');
const closeTitleSource = readFileSync(join(process.cwd(), 'src/shared/components/DialogCloseTitle.tsx'), 'utf8');
const submitReviewAction = source.match(/const submitReviewAction = async \(\) => \{([\s\S]*?)\n  \};\n\n  const handleCleanupApplication/)?.[1];
const resetReviewDialog = source.match(/const resetReviewDialog = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
const recoveryReviewSubmit = recoverySource.match(/const handleReviewSubmit = async \(\) => \{([\s\S]*?)\n  \};\n\n  const renderCell/)?.[1];
const closeRecoveryReviewDialog = recoverySource.match(/const closeReviewDialog = \(\) => \{([\s\S]*?)\n  \};/)?.[1];

assert.ok(submitReviewAction, '订单审核台必须保留审核提交处理。');
assert.ok(resetReviewDialog, '订单审核弹窗必须有统一清理入口。');
assert.ok(recoveryReviewSubmit, '售后审核台必须保留审核提交处理。');
assert.ok(closeRecoveryReviewDialog, '售后审核弹窗必须有统一清理入口。');
assert.match(
  submitReviewAction,
  /action\.type === 'approve'[\s\S]*?setApprovedApplication\(res\.data\)[\s\S]*?setReviewOutcome\(\{ type: action\.type, application: res\.data \}\)/,
  '通过应继续使用订单已入库专用结果窗；退回和驳回应设置各自的成功结果。',
);
assert.match(
  submitReviewAction,
  /setReviewError\(''\)[\s\S]*?if \(res\.code !== 0 \|\| !res\.data\) \{[\s\S]*?setReviewError\(res\.message \|\| '订单审核操作失败'\);[\s\S]*?return;[\s\S]*?\}/,
  '每次订单审核重试必须先清除旧错误，失败后把错误写回当前审核弹窗。',
);
assert.doesNotMatch(submitReviewAction, /await alert\(/, '订单审核失败不得另开全局反馈 Dialog。');
assert.doesNotMatch(submitReviewAction, /setReviewReason\(/, '订单审核失败必须保留退回或驳回原因以便重试。');
assert.match(submitReviewAction, /catch \(error\) \{[\s\S]*?setReviewError\(message\);[\s\S]*?\}/, '订单审核 Promise 异常必须显示在当前审核弹窗。');
assert.match(source, /const \[reviewError, setReviewError\] = useState\(''\);/, '订单审核弹窗必须维护内部错误状态。');
assert.match(resetReviewDialog, /setReviewError\(''\);/, '关闭订单审核弹窗必须清理内部错误。');
assert.match(
  source,
  /<Dialog[\s\S]*?open=\{Boolean\(reviewAction\)\}[\s\S]*?<DialogContent dividers>[\s\S]*?\{reviewError && \([\s\S]*?<Alert severity="error"[\s\S]*?\{reviewError\}[\s\S]*?<\/Alert>/,
  '订单审核错误必须作为 Alert 显示在原审核 Dialog 内。',
);
assert.doesNotMatch(source, /<Dialog open=\{Boolean\(reviewError\)\}/, '订单审核错误不得打开第二个 Dialog。');
assert.match(source, /const \[reviewSubmitting, setReviewSubmitting\] = useState\(false\);/, '审核提交必须有明确的提交中状态。');
assert.match(source, /const reviewSubmittingRef = React\.useRef\(false\);/, '快速双击前的同步重入也必须被阻断。');
assert.match(submitReviewAction, /if \(!reviewAction \|\| reviewSubmittingRef\.current\) return;/, '审核请求开始前必须拦截重复提交。');
assert.match(submitReviewAction, /reviewSubmittingRef\.current = true;\s*setReviewSubmitting\(true\);/, '审核请求开始时必须进入提交中状态。');
assert.match(submitReviewAction, /try \{[\s\S]*?\} catch \(error\) \{[\s\S]*?\} finally \{[\s\S]*?reviewSubmittingRef\.current = false;[\s\S]*?setReviewSubmitting\(false\);[\s\S]*?\}/, '订单审核网络异常后必须在 finally 中解除提交锁，允许重试。');

assert.match(
  recoveryReviewSubmit,
  /setReviewError\(''\)[\s\S]*?if \(res\.code !== 0\) \{[\s\S]*?setReviewError\(res\.message \|\| '审核操作失败'\);[\s\S]*?return;[\s\S]*?\}/,
  '每次售后审核重试必须先清除旧错误，失败后把错误写回当前审核弹窗。',
);
assert.doesNotMatch(recoveryReviewSubmit, /showErrorDialog\(/, '售后审核失败不得另开全局错误 Dialog。');
assert.doesNotMatch(recoveryReviewSubmit, /setReviewReason\(/, '售后审核失败必须保留退回或驳回原因以便重试。');
assert.match(recoveryReviewSubmit, /catch \(error\) \{[\s\S]*?setReviewError\([\s\S]*?\);[\s\S]*?\}/, '售后审核 Promise 异常必须显示在当前审核弹窗。');
assert.match(recoverySource, /const \[reviewError, setReviewError\] = useState\(''\);/, '售后审核弹窗必须维护内部错误状态。');
assert.match(closeRecoveryReviewDialog, /setReviewError\(''\);/, '关闭售后审核弹窗必须清理内部错误。');
assert.match(
  recoverySource,
  /<Dialog[\s\S]*?open=\{Boolean\(reviewAction\)\}[\s\S]*?<DialogContent dividers>[\s\S]*?\{reviewError && \([\s\S]*?<Alert severity="error"[\s\S]*?\{reviewError\}[\s\S]*?<\/Alert>/,
  '售后审核错误必须作为 Alert 显示在原审核 Dialog 内。',
);
assert.doesNotMatch(recoverySource, /<Dialog open=\{Boolean\(reviewError\)\}/, '售后审核错误不得打开第二个 Dialog。');
assert.match(recoveryReviewSubmit, /if \(!currentUser \|\| !reviewAction \|\| reviewSubmittingRef\.current\) return;/, '售后审核请求开始前必须拦截重复提交。');
assert.match(recoveryReviewSubmit, /reviewSubmittingRef\.current = true;\s*setReviewSubmitting\(true\);/, '售后审核请求开始时必须进入提交中状态。');
assert.match(recoveryReviewSubmit, /finally \{[\s\S]*?reviewSubmittingRef\.current = false;[\s\S]*?setReviewSubmitting\(false\);[\s\S]*?\}/, '售后审核完成后必须解除提交锁，允许重试。');

assert.match(source, /const \[reviewOutcome, setReviewOutcome\] = useState<ReviewOutcome \| null>\(null\);/);
assert.match(
  source,
  /const canCreateOrderApplication = hasPermission\(currentAuthUser, PERMISSION_KEYS\.ORDER_CREATE, 'write'\);/,
  '正式订单重提入口必须使用当前登录用户的新增订单写权限。',
);
assert.match(
  source,
  /const canResubmit = application\.status === ORDER_APPLICATION_STATUSES\.RETURNED\s*&& canCreateOrderApplication\s*&& isCurrentUserApplicant\(application\);/,
  '正式订单退回重提入口必须同时要求新增订单写权限和原申请人身份。',
);
assert.match(source, /<Dialog[\s\S]*?open=\{Boolean\(reviewAction\)\}/, '退回/驳回成功必须复用审核弹窗显示结果。');
assert.doesNotMatch(source, /<Dialog open=\{Boolean\(reviewOutcome\)\}/, '退回/驳回成功不得额外叠加第二个结果弹窗。');
assert.match(source, /onClose=\{reviewSubmitting \? undefined : closeReviewDialog\}/, '提交中不得通过遮罩或 Escape 关闭审核弹窗。');
assert.match(source, /closeDisabled=\{reviewSubmitting\}/, '提交中必须禁用审核弹窗关闭按钮。');
assert.match(closeTitleSource, /closeDisabled\?: boolean/, '关闭标题组件必须支持禁用关闭按钮。');
assert.match(closeTitleSource, /disabled=\{closeDisabled\}/, '关闭标题组件必须将禁用状态传给关闭按钮。');
assert.match(source, /<Button onClick=\{closeReviewDialog\} disabled=\{reviewSubmitting\}>取消<\/Button>/, '提交中必须禁用取消入口。');
assert.match(source, /disabled=\{reviewSubmitting \|\| \(\(reviewAction\?\.type === 'return' \|\| reviewAction\?\.type === 'reject'\) && !reviewReason\.trim\(\)\)\}/, '提交中必须禁用确认入口。');
assert.match(source, /已退回修改，创建人可修改后重新提交/, '退回成功必须明确创建人可修改后重新提交。');
assert.match(source, /已驳回终止，不会生成正式订单，不能重新提交/, '驳回成功必须明确终止、不会生成正式订单且不能重新提交。');
assert.match(source, />继续审核</, '成功结果必须让审核员继续审核。');
assert.match(source, />查看审核详情</, '退回成功应提供可靠的审核记录查看入口。');
assert.match(source, />查看已处理记录</, '驳回成功应可跳转至已处理记录。');
assert.match(source, /<Dialog open=\{Boolean\(approvedApplication\)\}/, '审核通过必须继续使用订单已入库专用结果窗。');
