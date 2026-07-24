# Finance Settlement Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一订单分账和售后挽回分账的默认表格、视图设置、详情分区、处理留痕与实时状态，使财务人员用同一套字段和状态完成核款、分账、确认、发放与撤回。

**Architecture:** 在现有 `CommissionOrderSummary` 与 `RecoveryOrder` 数据模型上补齐财务展示所需的摘要和处理留痕，列表组件只消费一次加载得到的摘要，不逐行请求。订单分账继续由 `commissionApi` 聚合正式订单与有效提成；售后分账在服务端命令和本地回退 API 中同步维护明确的经办、确认、发放、撤回字段，再由页面统一渲染表格和详情。

**Tech Stack:** React 18、TypeScript、Material UI 6、Express 5、Prisma、tsx/Node test runner、Vite

## Global Constraints

- 财务状态统一为 `待处理 → 待确认 → 待发放 → 已发放`，撤销后显示 `已撤回`。
- “操作”列固定在最右侧，不进入视图设置，不允许隐藏、拖动或冻结到其他位置。
- 分账总额只计算未撤回且未删除的有效分账明细；已撤回人数与待分配人数分开统计。
- 历史数据缺字段时显示 `-`，不得用创建人、当前登录人或其他无关字段冒充。
- 售后历史订单缺少原产品等级时只读回退产品配置，不反写历史订单。
- 保存、确认、撤回和删除成功后，当前行、状态统计和筛选结果必须立即同步；失败时保留原状态。
- 订单分账和售后挽回分账启用新的视图配置版本，旧浏览器配置不得污染新默认顺序。
- 不修改当前工作区中与客户导入、客户筛选有关的未提交文件。

---

### Task 1: 财务分账展示摘要与处理留痕模型

**Files:**
- Create: `src/shared/utils/financeSettlementPresentation.ts`
- Create: `src/shared/utils/financeSettlementPresentation.test.ts`
- Modify: `src/types/commission.ts`
- Modify: `src/types/recoveryOrder.ts`

**Interfaces:**
- Consumes: `Commission[]`、`CommissionOperationLog[]`、`Order`、`RecoveryOrder`
- Produces: `formatLeadSourcePath(order: Pick<Order, 'leadSource' | 'sourceName'>): string`、`summarizeCommissionProcessing(commissions: Commission[], logs: CommissionOperationLog[]): CommissionProcessingSummary`、`getActiveCommissions(commissions: Commission[]): Commission[]`
- Produces model fields: `paymentOrderNo`、`leadSourceFull`、`updatedAt`、`performanceAmount`、`settlementOperator`、`confirmedAt`、`paidAt`、`withdrawReason`，以及售后 `settlementHandledBy/At`、`settlementConfirmedBy/At`、`settlementPaidAt`、`settlementWithdrawnBy/At/Reason`

- [ ] **Step 1: Write the failing pure-function tests**

```ts
test('只汇总有效分账并提取最新处理留痕', () => {
  const summary = summarizeCommissionProcessing(
    [activeCommission, withdrawnCommission],
    [confirmLog, withdrawLog],
  );
  assert.equal(summary.totalCommissionAmount, activeCommission.commissionAmount);
  assert.equal(summary.withdrawnCount, 1);
  assert.equal(summary.confirmedAt, confirmLog.operatedAt);
  assert.equal(summary.withdrawReason, withdrawLog.reason);
});

test('完整线索来源去重并保留层级', () => {
  assert.equal(formatLeadSourcePath({ leadSource: '抖音', sourceName: '直播' }), '抖音 / 直播');
  assert.equal(formatLeadSourcePath({ leadSource: '官网', sourceName: '官网' }), '官网');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx tsx --test src/shared/utils/financeSettlementPresentation.test.ts`

Expected: FAIL because `financeSettlementPresentation.ts` and its exports do not exist.

- [ ] **Step 3: Add the summary types and minimal pure implementation**

```ts
export function getActiveCommissions(rows: Commission[]): Commission[] {
  return rows.filter((row) => !['已撤回', '已取消', '已冲销'].includes(row.status));
}

export function formatLeadSourcePath(order: Pick<Order, 'leadSource' | 'sourceName'>): string {
  return [...new Set([order.leadSource, order.sourceName].map((value) => String(value || '').trim()).filter(Boolean))].join(' / ');
}

export function summarizeCommissionProcessing(
  commissions: Commission[],
  logs: CommissionOperationLog[],
): CommissionProcessingSummary {
  const active = getActiveCommissions(commissions);
  const latest = [...logs].sort((a, b) => b.operatedAt.localeCompare(a.operatedAt));
  return {
    totalCommissionAmount: active.reduce((sum, row) => sum + Number(row.commissionAmount || 0), 0),
    performanceAmount: Math.max(0, ...active.map((row) => Number(row.performanceAmount || 0))),
    withdrawnCount: commissions.filter((row) => row.status === '已撤回').length,
    settlementOperator: latest[0]?.operator,
    confirmedAt: latest.find((log) => log.action === '确认分账')?.operatedAt,
    paidAt: active.map((row) => row.paidAt).filter(Boolean).sort().at(-1),
    withdrawReason: latest.find((log) => log.action === '撤回提成')?.reason,
  };
}
```

- [ ] **Step 4: Run the focused test and type-check**

Run: `npx tsx --test src/shared/utils/financeSettlementPresentation.test.ts && npx tsc -b --pretty false`

Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit the model unit**

```bash
git add src/shared/utils/financeSettlementPresentation.ts src/shared/utils/financeSettlementPresentation.test.ts src/types/commission.ts src/types/recoveryOrder.ts
git commit -m "feat: add finance settlement presentation model"
```

### Task 2: 订单分账摘要、表格与视图设置

**Files:**
- Modify: `src/api/commissionApi.ts`
- Modify: `src/pages/Commission/index.tsx`
- Modify: `src/api/commissionOrderSettlementView.test.ts`

**Interfaces:**
- Consumes: Task 1 `formatLeadSourcePath`、`getActiveCommissions`、`summarizeCommissionProcessing`
- Produces: 完整 `CommissionOrderSummary`；`ORDER_SPLIT_COLUMNS` 字段池；`DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS` 财务默认顺序；固定操作列

- [ ] **Step 1: Expand the static regression test with the approved field contract**

```ts
assert.match(source, /aaos_commission_order_split_view_v5/);
assert.deepEqual(defaultIds, [
  'orderNo', 'status', 'customerName', 'thirdPartyOrderNo', 'productName', 'productLevel',
  'orderAmount', 'officialPaymentChannel', 'paymentDate', 'salesOwner', 'createdByName',
  'splitDetails', 'totalCommissionAmount',
]);
for (const id of ['leadSourceFull', 'paymentOrderNo', 'updatedAt', 'performanceAmount', 'settlementOperator', 'confirmedAt', 'paidAt', 'withdrawReason']) {
  assert.match(source, new RegExp(`id: '${id}'`));
}
assert.doesNotMatch(viewFieldPool, /id: 'actions'/);
```

- [ ] **Step 2: Run the focused test and verify the old contract fails**

Run: `npx tsx --test src/api/commissionOrderSettlementView.test.ts`

Expected: FAIL because the page still uses view version v4 and the old default columns.

- [ ] **Step 3: Populate the new order summary fields in one aggregation pass**

```ts
const processing = summarizeCommissionProcessing(sortedRows, getCommissionOperationLogs(orderId));
const latestPayment = [...(order?.payments || [])].sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
return {
  ...existingSummary,
  paymentOrderNo: latestPayment?.paymentOrderNo,
  leadSourceFull: order ? formatLeadSourcePath(order) : '',
  updatedAt: sortedRows.map((row) => row.updatedAt).sort().at(-1),
  ...processing,
  splitSummary: getActiveCommissions(sortedRows).map(toSplitSummary),
};
```

- [ ] **Step 4: Replace the order settlement field pool and defaults**

Set `ORDER_SPLIT_VIEW_STORAGE_KEY` to `aaos_commission_order_split_view_v5` and the width key to `aaos_commission_order_split_widths_v4`. Add all approved optional fields, render `-` for missing historical values, format amount/time fields consistently, and keep the explicit action `<TableCell>` after all configurable cells.

```ts
const DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS: OrderSplitColumnId[] = [
  'orderNo', 'status', 'customerName', 'thirdPartyOrderNo', 'productName', 'productLevel',
  'orderAmount', 'officialPaymentChannel', 'paymentDate', 'salesOwner', 'createdByName',
  'splitDetails', 'totalCommissionAmount',
];
```

- [ ] **Step 5: Make split summaries compact and truthful**

Render at most two active assignments as `角色：人员 ¥金额`, append `另有 N 人` when needed, and show the active total. Do not include withdrawn/deleted rows in the summary or total.

- [ ] **Step 6: Run order settlement tests and build**

Run: `npx tsx --test src/api/commissionOrderSettlementView.test.ts src/api/commissionSettlementWorkflow.test.ts && npm run build`

Expected: all focused tests PASS and Vite build completes.

- [ ] **Step 7: Commit the order settlement unit**

```bash
git add src/api/commissionApi.ts src/pages/Commission/index.tsx src/api/commissionOrderSettlementView.test.ts
git commit -m "feat: unify order settlement finance fields"
```

### Task 3: 售后分账处理留痕持久化

**Files:**
- Modify: `server/services/recoveryOrderCommandService.ts`
- Modify: `server/services/recoveryOrderCommandService.test.ts`
- Modify: `src/api/recoveryOrderApi.ts`
- Modify: `src/api/recoveryOrderApi.test.ts`

**Interfaces:**
- Consumes: Task 1 `RecoveryOrder` settlement audit fields
- Produces: 服务端和本地回退路径一致的 `settlementHandledBy/At`、`settlementConfirmedBy/At`、`settlementWithdrawnBy/At/Reason`，以及发放时间兼容字段

- [ ] **Step 1: Add failing transition assertions**

```ts
assert.equal(saved.settlementHandledBy, actor);
assert.ok(saved.settlementHandledAt);
assert.equal(confirmed.settlementConfirmedBy, actor);
assert.ok(confirmed.settlementConfirmedAt);
assert.equal(withdrawn.settlementWithdrawReason, reason);
assert.equal(withdrawn.settlementWithdrawnBy, actor);
```

- [ ] **Step 2: Run server and local API tests to verify failure**

Run: `npx tsx --test server/services/recoveryOrderCommandService.test.ts src/api/recoveryOrderApi.test.ts`

Expected: FAIL because the explicit processing fields are absent.

- [ ] **Step 3: Persist the same audit fields in both command paths**

```ts
// 保存分账
settlementHandledBy: actor,
settlementHandledAt: now,
settlementWithdrawnBy: undefined,
settlementWithdrawnAt: undefined,
settlementWithdrawReason: undefined,

// 确认分账
settlementConfirmedBy: actor,
settlementConfirmedAt: now,

// 撤回分账
settlementWithdrawnBy: actor,
settlementWithdrawnAt: now,
settlementWithdrawReason: reason,
```

Reset must clear current active processing fields while retaining the existing business/review trail. Existing historical rows with only `auditReason` remain readable but are not rewritten.

- [ ] **Step 4: Run transition tests and type-check**

Run: `npx tsx --test server/services/recoveryOrderCommandService.test.ts src/api/recoveryOrderApi.test.ts && npx tsc -b --pretty false`

Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit the recovery audit unit**

```bash
git add server/services/recoveryOrderCommandService.ts server/services/recoveryOrderCommandService.test.ts src/api/recoveryOrderApi.ts src/api/recoveryOrderApi.test.ts
git commit -m "feat: persist recovery settlement processing audit"
```

### Task 4: 售后挽回分账表格、视图设置与详情分区

**Files:**
- Modify: `src/pages/Finance/RecoverySettlement.tsx`
- Modify: `src/api/recoveryOrderExperienceStatic.test.ts`

**Interfaces:**
- Consumes: Task 1/3 enriched `RecoveryOrder` fields and existing `getDetailRows(order)` commissions
- Produces: approved recovery field pool/defaults, fixed action column, source/payment/split/processing detail sections

- [ ] **Step 1: Add the approved field and detail contract to the static test**

```ts
assert.match(source, /finance_recovery_settlement_table_view_v2/);
for (const id of ['sourcePlatformShop', 'originalProductLevel', 'officialPaymentChannel', 'paymentAt', 'splitDetails', 'totalCommissionAmount', 'settlementHandledBy', 'settlementConfirmedAt', 'settlementPaidAt', 'settlementWithdrawReason']) {
  assert.match(source, new RegExp(`id: '${id}'`));
}
assert.doesNotMatch(viewColumnsBlock, /id: 'actions'/);
for (const section of ['源业务资料', '付款资料', '分账明细', '处理记录']) assert.match(source, new RegExp(section));
assert.match(source, /付款截图/);
assert.match(source, /成交路径 \/ 聊天记录/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx tsx --test src/api/recoveryOrderExperienceStatic.test.ts`

Expected: FAIL because actions are still configurable and the new fields/sections are missing.

- [ ] **Step 3: Replace the recovery field pool and defaults**

```ts
const DEFAULT_VISIBLE_COLUMNS: RecoverySettlementColumnId[] = [
  'recoveryNo', 'status', 'customerName', 'thirdPartyOrderNo', 'sourcePlatformShop',
  'originalProduct', 'originalProductLevel', 'originalAmount', 'recoveryAmount',
  'officialPaymentChannel', 'paymentAt', 'recoveryUserName', 'createdByName',
  'splitDetails', 'totalCommissionAmount',
];
```

Add optional contact, match, platform/shop, payment, recovery time, assistant, reviewer, review time, remark, timestamps, performance amount, operator, confirmation/payment/withdrawal fields. Use `finance_recovery_settlement_table_view_v2`. Remove `actions` from `RECOVERY_SETTLEMENT_COLUMNS` and render it as the last explicit sticky cell.

- [ ] **Step 4: Render active split aggregation and compatible historical values**

Use active `Commission[]` only for split details and total. `sourcePlatformShop` joins non-empty platform/shop with ` / `. Product level uses the stored snapshot first and existing product lookup only as a read-only fallback.

- [ ] **Step 5: Rebuild the settlement detail into four sections**

```tsx
<DetailSection title="源业务资料">...</DetailSection>
<DetailSection title="付款资料">...<AttachmentList title="付款截图" ... /></DetailSection>
<DetailSection title="分账明细">...</DetailSection>
<DetailSection title="处理记录">...</DetailSection>
<AttachmentList title="成交路径 / 聊天记录" ... />
```

The source order link continues to open the complete after-sales recovery record; the row view action opens this finance-processing detail.

- [ ] **Step 6: Verify mutation-driven refresh behavior**

Confirm that save/confirm/withdraw/reset/cleanup call `applySettlementMutation` or reload the list/counts on success, remove rows excluded by the current status filter, and leave the old row untouched on API failure.

- [ ] **Step 7: Run focused tests and build**

Run: `npx tsx --test src/api/recoveryOrderExperienceStatic.test.ts src/api/recoveryOrderApi.test.ts && npm run build`

Expected: PASS and production build completes.

- [ ] **Step 8: Commit the recovery presentation unit**

```bash
git add src/pages/Finance/RecoverySettlement.tsx src/api/recoveryOrderExperienceStatic.test.ts
git commit -m "feat: unify recovery settlement finance fields"
```

### Task 5: Cross-page regression and final verification

**Files:**
- Modify only if a regression is found: files changed in Tasks 1-4

**Interfaces:**
- Consumes: all previous task outputs
- Produces: verified financial field release with no unrelated customer-module changes included

- [ ] **Step 1: Run all directly related tests**

Run:

```bash
npx tsx --test \
  src/shared/utils/financeSettlementPresentation.test.ts \
  src/api/commissionOrderSettlementView.test.ts \
  src/api/commissionSettlementWorkflow.test.ts \
  src/api/recoveryOrderApi.test.ts \
  src/api/recoveryOrderExperienceStatic.test.ts \
  server/services/recoveryOrderCommandService.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run repository verification**

Run: `npm test && npm run build`

Expected: all repository tests PASS and Vite emits a successful production build.

- [ ] **Step 3: Manually verify the two finance pages**

Open `/finance?tab=settlement` and `/finance?tab=recovery-settlement`. Verify default order, view show/hide/reorder/freeze/reset, fixed operation cell, source/detail entry points, missing-value `-`, and immediate row/count changes after save, confirm, withdraw, and reset.

- [ ] **Step 4: Review the diff boundary**

Run: `git status --short && git diff --stat HEAD~4..HEAD`

Expected: finance/order/recovery model and test files plus this plan/spec are included; pre-existing customer import/filter edits remain unstaged and uncommitted.

- [ ] **Step 5: Commit any final regression-only corrections**

```bash
git add src/shared/utils/financeSettlementPresentation.ts src/shared/utils/financeSettlementPresentation.test.ts src/types/commission.ts src/types/recoveryOrder.ts src/api/commissionApi.ts src/pages/Commission/index.tsx src/api/commissionOrderSettlementView.test.ts server/services/recoveryOrderCommandService.ts server/services/recoveryOrderCommandService.test.ts src/api/recoveryOrderApi.ts src/api/recoveryOrderApi.test.ts src/pages/Finance/RecoverySettlement.tsx src/api/recoveryOrderExperienceStatic.test.ts
git commit -m "fix: complete finance settlement field regression"
```

Do not create an empty commit when no final correction is needed.
