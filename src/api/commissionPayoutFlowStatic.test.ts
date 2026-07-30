import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const financeSource = readFileSync(new URL('../pages/Finance/index.tsx', import.meta.url), 'utf8');
const payoutSource = readFileSync(new URL('../pages/Finance/CommissionPayout.tsx', import.meta.url), 'utf8');
const postPayoutCorrectionSource = readFileSync(new URL('../pages/Finance/PostPayoutCommissionCorrection.tsx', import.meta.url), 'utf8');
const commissionSource = readFileSync(new URL('../pages/Commission/index.tsx', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../../server/index.ts', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('../../server/services/commissionPayoutService.ts', import.meta.url), 'utf8');

assert.match(financeSource, /value:\s*'disbursement',\s*label:\s*'提成发放'/);
assert.doesNotMatch(financeSource, /value:\s*'payout',\s*label:\s*'员工提成月报'/);
assert.doesNotMatch(commissionSource, /生成发放单|确认本月已发放|确认此人已发/);
assert.match(commissionSource, /导出财务提成月度核对表/);

assert.match(payoutSource, /待发放/);
assert.doesNotMatch(payoutSource, /<TableCell align="right">订单 \/ 提成<\/TableCell>/, '待发放主表不得再把订单与提成混成一列');
assert.match(payoutSource, /<TableCell[^>]*>业务单数<\/TableCell>/);
assert.match(payoutSource, /<TableCell[^>]*>待处理<\/TableCell>/);
assert.match(payoutSource, /buildPendingEmployeePresentation\(row\)/, '桌面表格和移动卡片必须复用同一展示模型');
assert.match(payoutSource, /pendingConfirmCount/);
assert.match(payoutSource, /pendingPayCount/);
assert.match(payoutSource, /filterPendingEmployeeCommissions/, '员工待办明细必须支持五态口径下的状态筛选');
assert.match(payoutSource, /发放记录/);
assert.match(payoutSource, /label="月度报告"/);
assert.match(payoutSource, /确认发放/);
assert.doesNotMatch(payoutSource, /aria-label="撤销发放"|>确认撤销</);
assert.match(payoutSource, /原发放事实永久保留/);
assert.match(payoutSource, /发放后处理/);
assert.match(payoutSource, /PostPayoutCommissionCorrection/);
assert.match(payoutSource, /buildPostPayoutProcessingContext/);
assert.doesNotMatch(
  payoutSource,
  /const openPostPayoutProcessing[\s\S]{0,500}navigate\(/,
  '发放后处理必须保留在财务上下文，不得直接跳到订单或售后页',
);
assert.match(payoutSource, /源单不可用/);
assert.match(payoutSource, /processingContext/);
assert.match(postPayoutCorrectionSource, /setPrecheckAllowed\(precheck\.data\.allowed\)/, '当前源业务不可更正时也必须显示状态与原因');
assert.doesNotMatch(
  postPayoutCorrectionSource,
  /if \(!precheck\.data\.allowed\) throw new Error/,
  '预检不通过不得吞掉已加载的当前源业务状态',
);
assert.doesNotMatch(payoutSource, />暂不支持</, '正式订单不得再显示暂不支持');
assert.match(payoutSource, /isSuperAdmin\(currentUser\)/, '发放后处理入口必须仅对超级管理员开放');
assert.match(payoutSource, /detailRecord\?\.status === '已发放'/, '已撤销发放单不得显示发放后处理入口');
assert.match(payoutSource, /付款流水号/);
assert.match(payoutSource, /fetchRecordsWorkspace/);
assert.match(payoutSource, /subscribePageRefresh/);
assert.match(payoutSource, /setInterval[\s\S]{0,80}30_000/);
assert.doesNotMatch(payoutSource, /发放记录月份|RefreshOutlinedIcon|>刷新<|本月暂无发放记录/);
assert.doesNotMatch(payoutSource, /新建发放批次|核对并锁定|确认已付款/);
assert.match(commissionSource, /renderMinePayoutWorkspace\(\[selectedFinancePayoutRow\]\)/);
assert.match(commissionSource, /commissionPayoutApi\.fetchPeriodWorkspace\(period\)/, '财务月报必须读取服务端统一聚合结果');
assert.match(commissionSource, /正式订单实付/);
assert.match(commissionSource, /挽回成交额/);
assert.match(commissionSource, /状态分布/);
assert.match(commissionSource, /导出员工明细/);
assert.match(commissionSource, /commission\.status === '已发放'[\s\S]{0,100}commission\.commissionAmount/, '已发放阶梯提成不得在页面再次重算');
assert.match(commissionSource, /isRecoveryCommission\(commission\)[\s\S]{0,80}\? '售后挽回分账'/, '财务员工明细必须复用共享售后识别口径');
assert.match(payoutSource, /commissionSnapshots/);
assert.match(payoutSource, /visibleEmployeeDetailRows\.map/, '员工待发放明细必须按页渲染');
assert.match(payoutSource, /count=\{employeeDetailRows\.length\}/, '员工待发放明细必须显示统一分页');
assert.match(payoutSource, /visibleRecordOwnerRows\.map/, '发放单员工汇总必须按页渲染');
assert.match(payoutSource, /count=\{recordOwnerRows\.length\}/, '发放单员工汇总必须显示统一分页');
assert.match(payoutSource, /visibleRecordCommissionRows\.map/, '发放单逐笔提成必须按页渲染');
assert.match(payoutSource, /count=\{recordCommissionRows\.length\}/, '发放单逐笔提成必须显示统一分页');
assert.match(payoutSource, /currentPendingPage \* pendingRowsPerPage/, '待发放清单数据缩减后必须按有效页码切片');
assert.match(payoutSource, /page=\{currentEmployeeDetailPage\}/, '切换员工或明细缩减后必须使用有效页码');
assert.match(payoutSource, /page=\{currentRecordOwnerPage\}/, '发放单员工汇总必须使用有效页码');
assert.match(payoutSource, /page=\{currentRecordCommissionPage\}/, '发放单逐笔提成必须使用有效页码');
assert.ok((payoutSource.match(/moduleTableSx/g) || []).length >= 5, '提成发放主列表和详情表格必须统一复用系统表格样式');
assert.match(commissionSource, /visibleFinancePayoutRows\.map/, '财务员工月度报告必须按页渲染');
assert.match(commissionSource, /count=\{payoutRows\.length\}[\s\S]{0,160}page=\{currentFinanceMonthlyPage\}/, '财务员工月度报告必须显示统一分页');
assert.match(commissionSource, /Table size="small" sx=\{\[moduleTableSx, \{ minWidth: 1240 \}\]\}/, '提成明细桌面表格必须复用系统统一样式');
assert.match(commissionSource, /visibleMineCalculationDetailRows\.map/, '参与计算明细必须按页渲染');
assert.match(commissionSource, /count=\{mineCalculationDetailRows\.length\}[\s\S]{0,160}page=\{currentMineCalculationDetailPage\}/, '参与计算明细必须显示统一分页');

assert.match(serverSource, /\/api\/commission-payout-workspace/);
assert.match(serverSource, /scope === 'records'/);
assert.match(serverSource, /\/api\/commission-payouts\/issue/);
assert.match(serverSource, /\/api\/commission-payout-records\/:id\/reverse/);
assert.match(serviceSource, /STORAGE_KEYS\.COMMISSION_PAYOUT_BATCHES/);
assert.match(serviceSource, /status:\s*'已发放' as const/);
assert.match(serviceSource, /本版不支持撤销发放，请线下处理/);
assert.match(serviceSource, /active\.every[\s\S]{0,120}\? '已发放'/);

console.log('commission payout flow static tests passed');
