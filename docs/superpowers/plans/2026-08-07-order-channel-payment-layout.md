# Order Channel Payment Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the order application so official payment channel belongs to order and deal-channel information, while platform fields only appear and become required for company self-operated store payments.

**Architecture:** Add a small pure policy utility for platform-field visibility, completeness, and clearing. `OrderForm` consumes that policy for new orders, application editing, and formal-order correction, while the existing order data model and `BusinessSourceFields` component remain unchanged.

**Tech Stack:** React 18, TypeScript, MUI, existing `OrderForm`, Node assert tests, Vite.

## Global Constraints

- Reuse `officialPaymentChannel`, `sourcePlatformId`, `sourcePlatformName`, `sourceShopId`, `sourceShopName`, and `thirdPartyOrderNo`; do not add database fields.
- Selecting `公司自营小店` displays and requires source platform, source shop, and platform order number.
- Switching to another payment channel immediately clears all platform source fields.
- Existing orders with platform data continue to display those fields until the user actively changes the channel.
- Step 3 is named `订单与成交渠道`; Step 4 is named `付款与凭证`.
- Preserve existing payment, commission, settlement, and finance-transaction behavior.

---

### Task 1: Add order platform-source policy

**Files:**
- Create: `src/shared/utils/orderPlatformSource.ts`
- Test: `src/shared/utils/orderPlatformSource.test.ts`

**Interfaces:**
- Consumes: `OfficialPaymentChannel` and the existing platform source field shape.
- Produces: `isSelfOperatedStoreChannel(channel)`, `hasOrderPlatformSource(value)`, `isOrderPlatformSourceComplete(value)`, and `clearOrderPlatformSource(value)`.

- [ ] **Step 1: Write the failing policy tests**

```ts
import assert from 'node:assert/strict';
import {
  clearOrderPlatformSource,
  hasOrderPlatformSource,
  isOrderPlatformSourceComplete,
  isSelfOperatedStoreChannel,
} from './orderPlatformSource';

assert.equal(isSelfOperatedStoreChannel('公司自营小店'), true);
assert.equal(isSelfOperatedStoreChannel('对公银行转账'), false);
assert.equal(hasOrderPlatformSource({ sourcePlatformId: 'p1', sourceShopId: '', thirdPartyOrderNo: '' }), true);
assert.equal(isOrderPlatformSourceComplete({ sourcePlatformId: 'p1', sourceShopId: 's1', thirdPartyOrderNo: 'NO-1' }), true);
assert.deepEqual(clearOrderPlatformSource({
  sourcePlatformId: 'p1', sourcePlatformName: '抖音', sourceShopId: 's1', sourceShopName: '旗舰店', thirdPartyOrderNo: 'NO-1', notes: '保留',
}), {
  sourcePlatformId: '', sourcePlatformName: '', sourceShopId: '', sourceShopName: '', thirdPartyOrderNo: '', notes: '保留',
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx tsx src/shared/utils/orderPlatformSource.test.ts`

Expected: FAIL because `orderPlatformSource.ts` does not exist.

- [ ] **Step 3: Implement the pure policy functions**

```ts
export function isSelfOperatedStoreChannel(channel?: string): boolean {
  return channel === '公司自营小店';
}

export function hasOrderPlatformSource(value: OrderPlatformSourceFields): boolean {
  return Boolean(value.sourcePlatformId || value.sourceShopId || value.thirdPartyOrderNo);
}

export function isOrderPlatformSourceComplete(value: OrderPlatformSourceFields): boolean {
  return Boolean(value.sourcePlatformId && value.sourceShopId && value.thirdPartyOrderNo.trim());
}

export function clearOrderPlatformSource<T extends OrderPlatformSourceFields>(value: T): T {
  return { ...value, sourcePlatformId: '', sourcePlatformName: '', sourceShopId: '', sourceShopName: '', thirdPartyOrderNo: '' };
}
```

- [ ] **Step 4: Run the policy test**

Run: `npx tsx src/shared/utils/orderPlatformSource.test.ts`

Expected: PASS.

### Task 2: Reorganize OrderForm and enforce conditional behavior

**Files:**
- Modify: `src/pages/Orders/OrderForm.tsx`

**Interfaces:**
- Consumes: the four policy functions from Task 1 and the existing `BusinessSourceFields` component.
- Produces: consistent UI and validation for new applications, application editing, and formal-order correction.

- [ ] **Step 1: Import the policy and derive visibility**

```ts
const showPlatformSourceFields = isSelfOperatedStoreChannel(form.officialPaymentChannel)
  || hasOrderPlatformSource(form);
```

- [ ] **Step 2: Add a channel-specific change handler**

```ts
const handleOfficialPaymentChannelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
  const officialPaymentChannel = event.target.value as OfficialPaymentChannel;
  setForm((current) => isSelfOperatedStoreChannel(officialPaymentChannel)
    ? { ...current, officialPaymentChannel }
    : clearOrderPlatformSource({ ...current, officialPaymentChannel }));
};
```

- [ ] **Step 3: Add conditional validation before payload creation**

```ts
if (isSelfOperatedStoreChannel(form.officialPaymentChannel) && !isOrderPlatformSourceComplete(form)) {
  await showFormIssue('公司自营小店订单必须完整填写来源平台、来源店铺和平台订单号');
  return;
}
```

- [ ] **Step 4: Move and rename form sections**

Render `订单类型` and `官方收款渠道` in Step 3, conditionally render `BusinessSourceFields`, keep notes last, rename Step 3 to `订单与成交渠道`, and remove the channel field from Step 4. Keep Step 4 payment amount, time, payment order number, payment proof, and deal evidence unchanged.

- [ ] **Step 5: Align section summaries and error counts**

Count missing payment channel and conditional platform fields in `orderErrorCount`; keep amount and payment-date errors in `paymentErrorCount`. Include the payment channel in the Step 3 summary.

- [ ] **Step 6: Run type checking**

Run: `npx tsc -b --pretty false`

Expected: exit code 0.

### Task 3: Verify regression safety and responsive behavior

**Files:**
- Verify: `src/pages/Orders/OrderForm.tsx`
- Verify: `src/shared/utils/orderPlatformSource.test.ts`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: verified build and browser evidence.

- [ ] **Step 1: Run focused and full safe tests**

Run: `npx tsx src/shared/utils/orderPlatformSource.test.ts`

Run: `JIXIANG_SKIP_BUSINESS_RECYCLE_PURGE_INTEGRATION=YES npm test`

Expected: focused test passes; full suite passes or stops only at an existing isolated-database safety gate that is reported explicitly.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: Vite build succeeds.

- [ ] **Step 3: Verify browser interactions**

On desktop and narrow viewport, verify: default non-self-operated channel hides platform fields; selecting `公司自营小店` shows all three fields; changing back clears them; changing platform clears shop; incomplete self-operated store order is blocked by a modal; existing platform data remains visible in edit and correction modes.

- [ ] **Step 4: Audit and commit only scoped files**

Run: `git diff --check`

Stage only `src/shared/utils/orderPlatformSource.ts`, `src/shared/utils/orderPlatformSource.test.ts`, and `src/pages/Orders/OrderForm.tsx`, preserving `.codex_tmp/` and unrelated changes.

Commit: `feat: conditionally show order platform source fields`
