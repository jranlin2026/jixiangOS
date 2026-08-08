# 飞鸽客户资料入OS与绿旗闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让客服确认当前飞鸽客户资料后，一键完成极享OS幂等入库、保留原文追加 `#昵称/联系方式` 与 `#入OS`、并在同一飞鸽备注弹窗中设置绿色旗帜。

**Architecture:** 联系方式识别和备注合并保持为无DOM依赖的领域函数；飞鸽页面适配器负责受订单号与昵称保护的真实DOM读取和写入；侧边栏只编排“重新核对会话 → OS入库 → 备注与绿旗提交 → 结果上报”。后端在现有 `BrowserLeadSync` 上增加绿色旗帜执行状态，使重复入库和失败重试不会重复创建线索。

**Tech Stack:** React 18、TypeScript、Chrome Extension Manifest V3、JSDOM、Express、Prisma/MySQL、Node `assert`

## Global Constraints

- 本阶段必须由客服确认联系方式并点击主按钮，不得无人工确认自动入库。
- 客户名称固定使用飞鸽顶部抖音昵称。
- 只识别客户方向消息中的手机号或明确微信号；图片、语音和未加载历史消息继续人工补录。
- 只有已付款订单允许执行索号相关自动推荐；订单状态未知或未付款时不得自动发起索号动作。
- 新备注只增加 `#昵称/联系方式` 和 `#入OS`，不得新增 `#入EC`。
- 原备注不得覆盖、清空或删除，包括历史 `#入EC`、销售姓名、卡密和退款原因。
- 相同客户行和 `#入OS` 必须幂等，重复执行不得重复追加。
- 极享OS入库成功后才能提交飞鸽备注与绿色旗帜。
- 本阶段只自动选择绿色旗帜，其他颜色永远不得由插件自动选择。
- 当前客户或订单发生切换时必须停止剩余动作。
- 插件不得自动发送聊天消息。

---

### Task 1: 联系方式识别与OS备注领域规则

**Files:**
- Create: `apps/browser-extension/src/domain/orderCompletion.ts`
- Create: `apps/browser-extension/src/domain/orderCompletion.test.ts`
- Modify: `apps/browser-extension/src/domain/contactDetection.ts`
- Modify: `apps/browser-extension/src/domain/contactDetection.test.ts`
- Modify: `apps/browser-extension/package.json`

**Interfaces:**
- Consumes: `BrowserChatMessage` and `DetectedContact` from `contactDetection.ts`.
- Produces: `buildOsRemarkLines(input: OsRemarkInput): string[]`, `mergeOsOrderRemark(existing: string, input: OsRemarkInput): string`, and `isPaidOrderStatus(status: string): boolean` for the page adapter and side panel.

- [ ] **Step 1: Add failing contact-normalization tests**

Extend `contactDetection.test.ts` with customer-only cases:

```ts
assert.deepEqual(detectContact([
  { direction: 'OUTBOUND', text: '客服电话 13900000000' },
  { direction: 'INBOUND', text: '激活电话 138 2645 9812' },
]), { phone: '13826459812', source: 'CHAT', messageIndex: 1 });

assert.equal(detectContact([
  { direction: 'OUTBOUND', text: '微信号：service_888' },
]), null);

assert.deepEqual(detectContact([
  { direction: 'INBOUND', text: '我的微信是 user_name88' },
]), { wechat: 'user_name88', source: 'CHAT', messageIndex: 0 });
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/domain/contactDetection.test.ts`

Expected: the spaced phone or “微信是” case fails before the normalization change.

- [ ] **Step 3: Normalize phone and explicit WeChat forms**

Keep the inbound-only loop and replace the patterns with:

```ts
const phonePattern = /(?<!\d)(?:\+?86[\s-]?)?(1[3-9](?:[\s-]?\d){9})(?!\d)/;
const wechatPattern = /微信(?:号)?\s*(?:是|为|[:：])?\s*([a-zA-Z][-_a-zA-Z0-9]{5,19})/i;
```

Normalize the captured phone with `.replace(/[\s-]/g, '')`. Do not scan `OUTBOUND` or `SYSTEM` messages.

- [ ] **Step 4: Add failing remark merge tests**

Create `orderCompletion.test.ts`:

```ts
import assert from 'node:assert/strict';
import { buildOsRemarkLines, isPaidOrderStatus, mergeOsOrderRemark } from './orderCompletion';

const input = { nickname: '悠然一刻', phone: '13826459812', wechat: 'wx_user88' };
assert.deepEqual(buildOsRemarkLines(input), ['#悠然一刻/13826459812', '#入OS']);
assert.equal(mergeOsOrderRemark('', input), '#悠然一刻/13826459812\n#入OS');
assert.equal(
  mergeOsOrderRemark('#入EC\n#销售：小王', input),
  '#入EC\n#销售：小王\n#悠然一刻/13826459812\n#入OS',
);
assert.equal(
  mergeOsOrderRemark('#悠然一刻/13826459812\n#入OS', input),
  '#悠然一刻/13826459812\n#入OS',
);
assert.deepEqual(
  buildOsRemarkLines({ nickname: '悠然一刻', phone: '', wechat: 'wx_user88' }),
  ['#悠然一刻/wx_user88', '#入OS'],
);
assert.throws(() => buildOsRemarkLines({ nickname: '', phone: '', wechat: '' }), /昵称/);
assert.equal(isPaidOrderStatus('已付款'), true);
assert.equal(isPaidOrderStatus('待发货'), true);
assert.equal(isPaidOrderStatus('已关闭（售后完成）'), false);
assert.equal(isPaidOrderStatus('退款成功'), false);
assert.equal(isPaidOrderStatus(''), false);
console.log('browser order completion domain: ok');
```

- [ ] **Step 5: Run the new test and verify failure**

Run: `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/domain/orderCompletion.test.ts`

Expected: FAIL because `orderCompletion.ts` does not exist.

- [ ] **Step 6: Implement the pure remark rules**

Create `orderCompletion.ts` with these exact public types and functions:

```ts
export type OsRemarkInput = {
  nickname: string;
  phone?: string;
  wechat?: string;
};

export function buildOsRemarkLines(input: OsRemarkInput): string[] {
  const nickname = input.nickname.trim();
  const contact = input.phone?.trim() || input.wechat?.trim() || '';
  if (!nickname) throw new Error('抖音昵称不能为空');
  if (!contact) throw new Error('手机号或微信至少填写一项');
  return [`#${nickname}/${contact}`, '#入OS'];
}

export function mergeOsOrderRemark(existing: string, input: OsRemarkInput): string {
  const lines = buildOsRemarkLines(input);
  const currentLines = existing.split(/\r?\n/).map((line) => line.trim());
  const missing = lines.filter((line) => !currentLines.includes(line));
  if (!missing.length) return existing;
  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  return `${existing}${separator}${missing.join('\n')}`;
}

export function isPaidOrderStatus(status: string): boolean {
  const normalized = status.trim();
  if (!normalized || /未付款|待付款|退款|已关闭|取消/.test(normalized)) return false;
  return /已付款|待发货|已发货|已收货|交易成功|已完成/.test(normalized);
}
```

- [ ] **Step 7: Add the domain test to the extension test script and run both tests**

Insert `tsx src/domain/orderCompletion.test.ts` after `contactDetection.test.ts` in `apps/browser-extension/package.json`.

Run: `npm --prefix apps/browser-extension test`

Expected: all extension tests PASS.

- [ ] **Step 8: Commit the domain layer**

```bash
git add apps/browser-extension/src/domain/contactDetection.ts apps/browser-extension/src/domain/contactDetection.test.ts apps/browser-extension/src/domain/orderCompletion.ts apps/browser-extension/src/domain/orderCompletion.test.ts apps/browser-extension/package.json
git commit -m "feat(browser-extension): add OS order completion rules"
```

---

### Task 2: 真实飞鸽备注弹窗与绿色旗帜适配器

**Files:**
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.ts`
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`
- Modify: `apps/browser-extension/src/content/contentScript.ts`
- Modify: `apps/browser-extension/src/shared/contracts.ts`
- Modify: `apps/browser-extension/src/shared/activeTabMessaging.test.ts`

**Interfaces:**
- Consumes: `mergeOsOrderRemark(existing, input)` from Task 1.
- Produces: `completeOsOrder(input: CompleteOsOrderInput): Promise<CompleteOsOrderResult>` and page command `COMPLETE_FEIGE_OS_ORDER`.

- [ ] **Step 1: Define the guarded command and result contract**

Add to `contracts.ts`:

```ts
export type CompleteOsOrderInput = {
  expectedOrderNo: string;
  expectedCustomerDisplayName: string;
  phone?: string;
  wechat?: string;
};

export type CompleteOsOrderResult =
  | { ok: true; remarkText: string; remarkStatus: 'SUCCEEDED'; greenFlagStatus: 'SUCCEEDED' }
  | { ok: false; code: string; message: string; stage: 'CONTEXT' | 'REMARK' | 'GREEN_FLAG' | 'SAVE'; remarkText?: string };
```

Add `{ type: 'COMPLETE_FEIGE_OS_ORDER'; input: CompleteOsOrderInput }` to `PageCommand` and `CompleteOsOrderResult` to `PageCommandResult`.

- [ ] **Step 2: Add a realistic failing DOM test**

In `douyinFeigeAdapter.test.ts`, add a fixture matching the visible order card and modal semantics:

```html
<section data-testid="order-card">
  <span data-testid="order-no">6925095897028853458</span>
  <button data-testid="edit-order-remark">修改</button>
  <div data-testid="order-remark-summary">#入EC\n#销售：小王</div>
  <span data-testid="current-order-flag" data-current-flag="red"></span>
</section>
<div role="dialog" aria-label="添加备注" hidden>
  <div>订单标记</div>
  <button aria-label="绿色旗帜" data-flag-color="green"></button>
  <textarea data-testid="order-remark-input"></textarea>
  <button data-testid="order-remark-save">保存</button>
</div>
```

The edit-button listener unhides the dialog and copies the summary into the textarea. The save-button listener writes textarea content back to the summary, sets `data-current-flag="green"`, records the selected green flag, and hides the dialog. Assert:

```ts
const result = await adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  phone: '13826459812',
});
assert.deepEqual(result, {
  ok: true,
  remarkText: '#入EC\n#销售：小王\n#悠然一刻/13826459812\n#入OS',
  remarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'SUCCEEDED',
});
assert.equal(selectedFlag, 'green');
```

Add negative cases for mismatched order number, missing green semantic selector, and missing save button. Verify the save button is not clicked in every negative case.

- [ ] **Step 3: Run the adapter test and verify failure**

Run: `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`

Expected: FAIL because `completeOsOrder` is not defined.

- [ ] **Step 4: Add semantic DOM helpers and selector candidates**

In `douyinFeigeAdapter.ts`, add selector candidates without using color-option index positions:

```ts
orderCard: ['[data-testid="order-card"]', '[class*="order-card"]', '[class*="orderItem"]'],
orderRemarkSummary: ['[data-testid="order-remark-summary"]', '[class*="remark-content"]'],
orderRemarkEdit: ['[data-testid="edit-order-remark"]'],
orderRemarkDialog: ['[role="dialog"][aria-label*="备注"]', '[role="dialog"]'],
greenFlag: ['[data-flag-color="green"]', '[aria-label*="绿色旗帜"]', '[title*="绿色旗帜"]'],
currentOrderFlag: ['[data-testid="current-order-flag"]', '[data-current-flag]'],
```

Add `findButtonByText(root, ['添加备注', '修改'])` as the fallback for the edit button, and `findButtonByText(dialog, ['保存'])` as the save fallback. Never select the green flag by ordinal position.

Add:

```ts
async function waitForElement(
  document: Document,
  lookup: () => HTMLElement | null,
  timeoutMs = 1500,
): Promise<HTMLElement | null>
```

Implement it with `MutationObserver` plus a timeout; disconnect both paths.

- [ ] **Step 5: Implement guarded modal completion**

Implement `completeOsOrder(input)` in this order:

```ts
// 1. Re-read current order number and customer nickname.
// 2. Reject missing or changed context before any click.
// 3. Find the order card containing expectedOrderNo.
// 4. Click 添加备注/修改 and wait for the visible dialog.
// 5. Read existing textarea value, or fall back to the order remark summary.
// 6. Merge with mergeOsOrderRemark().
// 7. Require a semantically identified green flag and save button before changing either field.
// 8. Fill merged text, click green, click save.
// 9. Wait for dialog closure and require the rendered order summary to contain both desired lines and the order card to expose a green active flag signal.
// 10. Return SUCCEEDED only after verification; otherwise return SAVE failure.
```

Dispatch `input` and `change` after filling. When validation fails after opening the modal, leave the modal open for the客服 and do not click save.

- [ ] **Step 6: Make the content command asynchronous**

In `contentScript.ts`, handle the command with:

```ts
if (message.type === 'COMPLETE_FEIGE_OS_ORDER') {
  void adapter.completeOsOrder(message.input)
    .then(sendResponse)
    .catch((error) => sendResponse({
      ok: false,
      code: 'ORDER_COMPLETION_FAILED',
      message: error instanceof Error ? error.message : '订单备注与绿旗处理失败',
      stage: 'SAVE',
    }));
  return true;
}
```

Keep all existing synchronous commands unchanged.

- [ ] **Step 7: Verify active-tab routing and adapter behavior**

Extend `activeTabMessaging.test.ts` to assert the complete input is forwarded unchanged. Then run:

```bash
npm --prefix apps/browser-extension test
npm --prefix apps/browser-extension run typecheck
```

Expected: both commands PASS.

- [ ] **Step 8: Commit the page adapter**

```bash
git add apps/browser-extension/src/content/douyinFeigeAdapter.ts apps/browser-extension/src/content/douyinFeigeAdapter.test.ts apps/browser-extension/src/content/contentScript.ts apps/browser-extension/src/shared/contracts.ts apps/browser-extension/src/shared/activeTabMessaging.test.ts
git commit -m "feat(browser-extension): complete Feige OS remark and green flag"
```

---

### Task 3: 持久化绿色旗帜执行结果

**Files:**
- Create: `prisma/migrations/20260808093000_browser_green_flag_status/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `server/services/browserAgent/browserLeadIntakeService.ts`
- Modify: `server/services/browserAgent/browserLeadIntakeService.test.ts`
- Modify: `server/services/browserAgent/prismaBrowserLeadSyncRepository.ts`
- Modify: `server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts`
- Modify: `server/routes/browserAgentRoutes.ts`
- Modify: `server/routes/browserAgentRoutes.test.ts`
- Modify: `apps/browser-extension/src/shared/contracts.ts`
- Modify: `apps/browser-extension/src/background/serviceWorker.ts`

**Interfaces:**
- Consumes: the `syncId` returned by `CREATE_LEAD_INTAKE` and the page result from Task 2.
- Produces: worker command `REPORT_PLATFORM_COMPLETION` and API `POST /api/browser-agent/lead-intakes/:syncId/platform-completion`.

- [ ] **Step 1: Add failing service and route tests**

Extend the service repository fake with `reportPlatformCompletion`. Assert that:

```ts
const completion = await service.reportPlatformCompletion('sync-1', {
  orderRemarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'SUCCEEDED',
}, actor);
assert.equal(completion.data?.orderRemarkStatus, 'SUCCEEDED');
assert.equal(completion.data?.greenFlagStatus, 'SUCCEEDED');
```

Add rejection tests for invalid statuses and a route test for `/lead-intakes/sync-1/platform-completion`.

- [ ] **Step 2: Run focused server tests and verify failure**

Run:

```bash
npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts
npm exec -- tsx server/routes/browserAgentRoutes.test.ts
```

Expected: FAIL because the new method and route do not exist.

- [ ] **Step 3: Add schema columns and SQL migration**

Add to `BrowserLeadSync`:

```prisma
greenFlagStatus   String    @default("NOT_ATTEMPTED") @db.VarChar(24)
greenFlagError    String?   @db.VarChar(1000)
greenFlaggedAt    DateTime?
```

Migration SQL:

```sql
ALTER TABLE `browser_lead_syncs`
  ADD COLUMN `greenFlagStatus` VARCHAR(24) NOT NULL DEFAULT 'NOT_ATTEMPTED',
  ADD COLUMN `greenFlagError` VARCHAR(1000) NULL,
  ADD COLUMN `greenFlaggedAt` DATETIME(3) NULL;
```

- [ ] **Step 4: Extend service and repository contracts**

Add `greenFlagStatus` to `BrowserLeadSyncRecord` and `BrowserLeadIntakeResult`. Add:

```ts
reportPlatformCompletion(
  id: string,
  operator: { id: string; name: string },
  input: {
    orderRemarkStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
    greenFlagStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
    errorMessage?: string;
  },
): Promise<BrowserLeadSyncRecord | null>;
```

The repository must set `orderRemarkedAt` and `greenFlaggedAt` only for `SUCCEEDED`, retain prior successful values during retries, and truncate errors to 1000 characters.

- [ ] **Step 5: Add the route and extension worker command**

Add the authenticated route using `requireLeadCreate`. Add to `WorkerCommand`:

```ts
| {
    type: 'REPORT_PLATFORM_COMPLETION';
    syncId: string;
    orderRemarkStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
    greenFlagStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
    errorMessage?: string;
  }
```

Have `serviceWorker.ts` POST that payload to the new endpoint. Keep `REPORT_ORDER_REMARK` temporarily for backward compatibility until Task 4 removes its call sites.

- [ ] **Step 6: Generate Prisma client and run tests**

Run:

```bash
npm run db:generate
npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts
npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts
npm exec -- tsx server/routes/browserAgentRoutes.test.ts
```

Expected: all commands PASS.

- [ ] **Step 7: Commit persistence changes**

```bash
git add prisma/schema.prisma prisma/migrations/20260808093000_browser_green_flag_status/migration.sql server/services/browserAgent/browserLeadIntakeService.ts server/services/browserAgent/browserLeadIntakeService.test.ts server/services/browserAgent/prismaBrowserLeadSyncRepository.ts server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts server/routes/browserAgentRoutes.ts server/routes/browserAgentRoutes.test.ts apps/browser-extension/src/shared/contracts.ts apps/browser-extension/src/background/serviceWorker.ts
git commit -m "feat: track browser green flag completion"
```

---

### Task 4: 侧边栏一键闭环与分步重试

**Files:**
- Create: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts`
- Create: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts`
- Modify: `apps/browser-extension/src/sidepanel/main.tsx`
- Modify: `apps/browser-extension/src/sidepanel/styles.css`
- Modify: `apps/browser-extension/package.json`

**Interfaces:**
- Consumes: `CREATE_LEAD_INTAKE`, `COMPLETE_FEIGE_OS_ORDER`, `REPORT_PLATFORM_COMPLETION`, `buildOsRemarkLines` and `CompleteOsOrderResult`.
- Produces: a side-panel workflow state with separate OS, remark and green-flag statuses.

- [ ] **Step 1: Add a failing orchestration test**

Create `orderCompletionWorkflow.test.ts` around injected dependencies. Cover:

```ts
const result = await runOrderCompletion(input, {
  readContext: async () => currentContext,
  intake: async () => ({ code: 0, data: intakeResult, message: 'success' }),
  completePage: async () => ({
    ok: true,
    remarkText: '#悠然一刻/13826459812\n#入OS',
    remarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  }),
  report: async () => ({ code: 0, data: completionResult, message: 'success' }),
});
assert.equal(result.stage, 'COMPLETED');
```

Add tests proving page completion is not called after OS failure, report is called after page failure, `ALREADY_CREATED` continues to page completion, and changed order/customer stops before intake.

- [ ] **Step 2: Run the workflow test and verify failure**

Run: `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts`

Expected: FAIL because the workflow module does not exist.

- [ ] **Step 3: Implement the workflow state machine**

Define:

```ts
export type OrderCompletionStage =
  | 'READY'
  | 'INTAKING'
  | 'OS_COMPLETED'
  | 'PLATFORM_COMPLETING'
  | 'PLATFORM_FAILED'
  | 'COMPLETED';
```

`runOrderCompletion` must re-read and compare both order number and nickname before intake, accept `ALREADY_CREATED`, call the combined page command only after intake success, and always report the final platform result when a `syncId` exists.

- [ ] **Step 4: Replace the side-panel intake/report flow**

In `main.tsx`:

- Make the抖音昵称 input read-only and label it `抖音昵称`.
- Keep phone, WeChat, source switch and confirmation checkbox.
- Use `isPaidOrderStatus(context.orderStatus)` for both索号推荐 and the main completion button. Unknown, unpaid, closed, cancelled, or refund states stay blocked and show `请先确认当前订单为已付款有效订单`.
- Change the primary button to `一键入OS并完成订单`.
- Replace `reportRemark()` with the workflow module.
- Preserve the latest `syncId` and allow `重试订单备注和绿旗` without calling intake again.
- Show three status rows: `极享OS入库`、`订单备注`、`绿色旗帜`.
- Keep `复制备注` for any platform failure.

- [ ] **Step 5: Add minimal status styles**

In `styles.css`, add a compact `.completion-steps` grid using existing card colors. Reuse existing `.status`, `.success`, `.warning`, and `.error` tokens; do not introduce a new visual system.

- [ ] **Step 6: Register and run the workflow tests**

Add `tsx src/sidepanel/orderCompletionWorkflow.test.ts` to the extension test script, then run:

```bash
npm --prefix apps/browser-extension test
npm --prefix apps/browser-extension run typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit the side-panel workflow**

```bash
git add apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts apps/browser-extension/src/sidepanel/main.tsx apps/browser-extension/src/sidepanel/styles.css apps/browser-extension/package.json
git commit -m "feat(browser-extension): add assisted OS completion workflow"
```

---

### Task 5: 真实页面校准、回归与操作文档

**Files:**
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.ts`
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`
- Modify: `docs/ai-browser-employee-mvp.md`

**Interfaces:**
- Consumes: the semantic adapter and side-panel workflow from Tasks 1-4.
- Produces: a tested extension build in `apps/browser-extension/dist` and operator instructions for the assisted workflow.

- [ ] **Step 1: Capture real paid-order DOM evidence without writing**

Open one paid test order and use read-only browser inspection to record:

- the order card ancestor containing the order number;
- the “添加备注/修改” control attributes;
- the visible remark modal attributes;
- the textarea attributes;
- the green flag accessible attributes;
- the save button attributes;
- the DOM signal after a successful save.

Do not click save or change a flag during this evidence step.

- [ ] **Step 2: Add the real semantic attributes to the fixture first**

Update the JSDOM fixture with the exact stable attributes observed in Step 1. Add one failing assertion for each selector that differs from the current candidates.

- [ ] **Step 3: Run the adapter test and verify the calibrated fixture fails**

Run: `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`

Expected: FAIL only on the newly observed selector or verification signal.

- [ ] **Step 4: Update only the proven selector candidates**

Add stable `data-*`, `aria-*`, `role`, or text-anchored candidates from the evidence. Do not add generated CSS module hashes, positional selectors, or a green-flag option index.

- [ ] **Step 5: Perform one supervised real-order acceptance run**

With N哥或客服在场，use a paid test order and verify:

1. Refresh identifies nickname, order and contact.
2. The客服 confirms the contact and clicks the one-button workflow.
3. 极享OS contains one lead for the order.
4. Existing order remark remains unchanged before the two missing lines.
5. The order shows `#昵称/联系方式` and `#入OS` once each.
6. The order flag is green.
7. Clicking retry does not duplicate the lead or remark.

If a safe paid test order is unavailable, stop before any write and leave the feature reporting the precise missing selector; do not simulate success.

- [ ] **Step 6: Update operator documentation**

Document in `docs/ai-browser-employee-mvp.md`:

- the assisted workflow steps;
- the exact OS remark format;
- that historical `#入EC` is preserved but never newly added;
- green is the only automatic flag;
- manual fallback and retry behavior;
- the requirement to reload the unpacked extension after build.

- [ ] **Step 7: Run final verification and build**

Run:

```bash
npm --prefix apps/browser-extension test
npm --prefix apps/browser-extension run typecheck
npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts
npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts
npm exec -- tsx server/routes/browserAgentRoutes.test.ts
npm run build
npm --prefix apps/browser-extension run build
test -f apps/browser-extension/dist/manifest.json
git diff --check
git status --short
```

Expected: tests, type checks and builds PASS; only intentional source changes are present.

- [ ] **Step 8: Commit calibration and docs**

```bash
git add apps/browser-extension/src/content/douyinFeigeAdapter.ts apps/browser-extension/src/content/douyinFeigeAdapter.test.ts docs/ai-browser-employee-mvp.md
git commit -m "docs: calibrate assisted Feige completion workflow"
```
