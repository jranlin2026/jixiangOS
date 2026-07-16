# Business Attachments, Delivery Feedback, and After-Sales Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline and metadata-only attachments with a secure shared attachment flow, add multi-image paste support, improve delivery save/completion feedback, and add configurable after-sales platform/shop selection.

**Architecture:** Store file bytes outside business JSON and keep typed `BusinessAttachment` references on orders, recovery orders, and delivery tasks. A focused server attachment service owns validation, storage, draft ownership, record association, protected reads, and deletion; React uses one shared attachment picker while each business module retains its own limits and permissions.

**Tech Stack:** React 18, TypeScript, Material UI, Express 5, Prisma 6, MySQL, Multer, Node test scripts executed through `tsx`.

## Global Constraints

- Order payment proof accepts exactly one image; order deal evidence accepts at most 8 images.
- Recovery payment proof and recovery chat evidence each accept at most 8 images.
- Image files are at most 10 MB; delivery documents are at most 20 MB.
- Recovery customer name is required and at least one of phone or WeChat is required.
- Platform and shop use stable IDs plus name snapshots; disabled values remain visible historically but cannot be selected for new records.
- New attachment reads are authenticated and permission checked; never expose the attachment disk directory as static content.
- Legacy single Base64 fields remain readable during the compatibility period.
- Use test-first red-green cycles for every behavior change.

---

## File Structure

**Create**

- `src/types/businessAttachment.ts`: shared attachment categories and public metadata.
- `server/services/businessAttachmentService.ts`: validation, draft ownership, file persistence, association, access lookup, and deletion.
- `server/services/businessAttachmentService.test.ts`: service-level limits, ownership, rollback, and path-safety tests.
- `src/api/businessAttachmentApi.ts`: authenticated upload/read/delete client.
- `src/shared/utils/attachmentSelection.ts`: pure selection, dedupe, paste, and limit rules.
- `src/shared/utils/attachmentSelection.test.ts`: pure multi-file rule tests.
- `src/shared/components/BusinessAttachmentPicker.tsx`: shared upload, paste, preview, progress, and delete UI.
- `src/types/afterSalesSource.ts`: platform/shop configuration model.
- `src/pages/Settings/AfterSalesSourceConfig.tsx`: platform and shop maintenance UI.
- `src/api/afterSalesSourceApi.ts`: configuration API and local fallback.
- `server/services/afterSalesSourceService.ts`: validated configuration persistence.
- `server/services/afterSalesSourceService.test.ts`: stable ID, hierarchy, disable, and duplicate tests.

**Modify**

- `package.json`, `pnpm-lock.yaml`: add Multer and its TypeScript types.
- `server/index.ts`: protected attachment and source-config routes.
- `src/api/index.ts`: export new APIs.
- `src/shared/utils/constants.ts`: storage keys and defaults.
- `src/shared/utils/permissions.ts`, `src/shared/utils/organizationConfig.ts`: after-sales settings permission.
- `src/pages/Settings/RolePermission.tsx`, `src/pages/Settings/index.tsx`, `src/layouts/Sidebar.tsx`: expose the new settings capability.
- `src/types/order.ts`, `src/types/recoveryOrder.ts`, `src/types/delivery.ts`: attachment arrays and source snapshots.
- `src/pages/Orders/OrderForm.tsx`: one payment proof, up to eight deal images, paste and multiple selection.
- `src/pages/OrderReview/index.tsx`, `src/pages/Orders/OrderDetail.tsx`: new and legacy attachment rendering.
- `server/services/orderApplicationService.ts`, `server/services/orderCommandService.ts`, `server/services/orderApprovalEffectsService.ts`: validate and retain attachment references.
- `src/api/orderReviewApi.ts`, `src/api/orderApi.ts`: new attachment serialization and legacy normalization.
- `src/pages/AfterSales/RecoveryOrderTab.tsx`: contact validation, platform/shop select, multi-attachment picker.
- `server/services/recoveryOrderCommandService.ts`, `src/api/recoveryOrderApi.ts`: contact/source/attachment validation and persistence.
- `src/pages/Finance/RecoverySettlement.tsx`: compatibility rendering where evidence is shown.
- `server/services/deliveryCommandService.ts`, `src/api/deliveryApi.ts`, `server/index.ts`: real delivery attachment lifecycle.
- `src/pages/Delivery/index.tsx`: explicit task save, unsaved feedback, attachment actions, completion timestamps.
- `src/shared/utils/listPayload.ts`: keep list responses compact while retaining attachment metadata.

---

### Task 1: Pure attachment selection rules

**Files:**
- Create: `src/shared/utils/attachmentSelection.ts`
- Test: `src/shared/utils/attachmentSelection.test.ts`

**Interfaces:**
- Produces: `selectAttachments(current, incoming, { maxCount, accept, maxBytes }): AttachmentSelectionResult`.
- Produces: `clipboardImageFiles(dataTransfer): File[]`.
- Consumed by: `BusinessAttachmentPicker` and the single order payment picker.

- [ ] **Step 1: Write the failing selection tests**

```ts
import assert from 'node:assert/strict';
import { selectAttachments } from './attachmentSelection';

const image = (name: string, size = 100) => new File(['x'.repeat(size)], name, { type: 'image/png', lastModified: 1 });
assert.deepEqual(selectAttachments([], [image('a.png'), image('b.png')], {
  maxCount: 1, maxBytes: 10_000, accept: ['image/'], rejectWholeBatchOnOverflow: true,
}).accepted, []);
assert.equal(selectAttachments([], Array.from({ length: 9 }, (_, i) => image(`${i}.png`)), {
  maxCount: 8, maxBytes: 10_000, accept: ['image/'], rejectWholeBatchOnOverflow: false,
}).accepted.length, 8);
assert.equal(selectAttachments([image('a.png')], [image('a.png')], {
  maxCount: 8, maxBytes: 10_000, accept: ['image/'], rejectWholeBatchOnOverflow: false,
}).duplicates.length, 1);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm exec tsx src/shared/utils/attachmentSelection.test.ts`
Expected: FAIL because `attachmentSelection.ts` does not exist.

- [ ] **Step 3: Implement the pure selector**

```ts
export type AttachmentSelectionOptions = {
  maxCount: number;
  maxBytes: number;
  accept: string[];
  rejectWholeBatchOnOverflow: boolean;
};

export function selectAttachments(current: File[], incoming: File[], options: AttachmentSelectionOptions) {
  const key = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
  const existing = new Set(current.map(key));
  const duplicates = incoming.filter((file) => existing.has(key(file)));
  const valid = incoming.filter((file) => !existing.has(key(file))
    && file.size <= options.maxBytes
    && options.accept.some((prefix) => file.type.startsWith(prefix)));
  if (options.rejectWholeBatchOnOverflow && current.length + valid.length > options.maxCount) {
    return { accepted: [], duplicates, rejected: valid, reason: `最多上传 ${options.maxCount} 张` };
  }
  const remaining = Math.max(0, options.maxCount - current.length);
  return { accepted: valid.slice(0, remaining), duplicates, rejected: valid.slice(remaining) };
}

export function clipboardImageFiles(data: DataTransfer): File[] {
  return Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `pnpm exec tsx src/shared/utils/attachmentSelection.test.ts`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/utils/attachmentSelection.ts src/shared/utils/attachmentSelection.test.ts
git commit -m "feat: add attachment selection rules"
```

### Task 2: Secure business attachment service

**Files:**
- Create: `src/types/businessAttachment.ts`
- Create: `server/services/businessAttachmentService.ts`
- Test: `server/services/businessAttachmentService.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `server/index.ts`

**Interfaces:**
- Produces: `BusinessAttachment`, `BusinessAttachmentCategory`.
- Produces: `createBusinessAttachmentService({ prisma, rootDir, now })` with `uploadDraft`, `associate`, `open`, `remove`, and `cleanupExpiredDrafts`.
- Produces routes: `POST /api/business-attachments`, `GET /api/business-attachments/:id`, `DELETE /api/business-attachments/:id`.

- [ ] **Step 1: Add failing service tests**

```ts
const service = createBusinessAttachmentService({ prisma, rootDir, now: () => NOW });
const uploaded = await service.uploadDraft({
  draftKey: 'draft-order-1', category: 'order-deal-evidence',
  file: { originalname: '../chat.png', mimetype: 'image/png', size: 3, buffer: Buffer.from('png') },
}, salesUser);
assert.equal(uploaded.data?.name, 'chat.png');
assert.equal(uploaded.data?.uploadedById, salesUser.id);
assert.equal((await service.open(uploaded.data!.id, otherSales)).code, 403);
assert.equal((await service.associate([uploaded.data!.id], { domain: 'orderApplications', recordId: 'app-1' }, salesUser)).code, 0);
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `pnpm exec tsx server/services/businessAttachmentService.test.ts`
Expected: FAIL because the service is missing.

- [ ] **Step 3: Add Multer and implement storage**

Run: `pnpm add multer && pnpm add -D @types/multer`

Implement metadata as a `business_records` entry in domain `jixiang_os_business_attachments`, store bytes under `uploads/business-attachments/<generated-id>`, sanitize the display name with `path.basename`, and never return `storageName` in API metadata.

```ts
export interface BusinessAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  category: BusinessAttachmentCategory;
  uploadedById: string;
  uploadedByName: string;
  uploadedAt: string;
}
```

- [ ] **Step 4: Add authenticated routes**

Use `multer.memoryStorage()` with a 20 MB hard ceiling. Apply category-specific size and MIME checks in the service. Route reads through `service.open`, then `res.sendFile` or `res.download`; do not mount the directory with `express.static`.

- [ ] **Step 5: Run service and auth tests**

Run: `pnpm exec tsx server/services/businessAttachmentService.test.ts && pnpm exec tsx server/storageRoutesAuth.test.ts`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/types/businessAttachment.ts server/services/businessAttachmentService.ts server/services/businessAttachmentService.test.ts server/index.ts server/storageRoutesAuth.test.ts
git commit -m "feat: add secure business attachment service"
```

### Task 3: Shared attachment API and picker

**Files:**
- Create: `src/api/businessAttachmentApi.ts`
- Create: `src/shared/components/BusinessAttachmentPicker.tsx`
- Modify: `src/api/index.ts`
- Test: `src/api/businessAttachmentApi.test.ts`

**Interfaces:**
- Consumes: Task 1 selection rules and Task 2 routes/types.
- Produces: `businessAttachmentApi.upload`, `businessAttachmentApi.remove`, `businessAttachmentApi.contentUrl`.
- Produces component props `{ value, onChange, category, draftKey, maxCount, imagesOnly, rejectWholeBatchOnOverflow }`.

- [ ] **Step 1: Write failing API contract tests**

```ts
const calls: Array<{ url: string; method?: string }> = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), method: init?.method });
  return new Response(JSON.stringify({ code: 0, data: attachment, message: 'success' }), { status: 200 });
};
await businessAttachmentApi.upload(file, { draftKey: 'draft-1', category: 'order-deal-evidence' });
assert.equal(calls[0].method, 'POST');
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec tsx src/api/businessAttachmentApi.test.ts`
Expected: FAIL because the API is missing.

- [ ] **Step 3: Implement API and picker**

The picker must set `tabIndex={0}`, handle `onPaste`, use `clipboardImageFiles`, accept multiple file input when `maxCount > 1`, upload accepted files one at a time, retain successful uploads when another fails, and show a delete button per attachment.

- [ ] **Step 4: Verify GREEN and typecheck**

Run: `pnpm exec tsx src/api/businessAttachmentApi.test.ts && pnpm exec tsc -b --pretty false`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/api/businessAttachmentApi.ts src/api/businessAttachmentApi.test.ts src/api/index.ts src/shared/components/BusinessAttachmentPicker.tsx
git commit -m "feat: add reusable attachment picker"
```

### Task 4: Order attachment arrays and compatibility

**Files:**
- Modify: `src/types/order.ts`
- Modify: `src/pages/Orders/OrderForm.tsx`
- Modify: `src/api/orderReviewApi.ts`
- Modify: `src/api/orderApi.ts`
- Modify: `server/services/orderApplicationService.ts`
- Modify: `server/services/orderCommandService.ts`
- Modify: `server/services/orderApprovalEffectsService.ts`
- Modify: `src/pages/OrderReview/index.tsx`
- Modify: `src/pages/Orders/OrderDetail.tsx`
- Test: `server/services/orderApplicationService.test.ts`
- Test: `src/api/orderReviewApi.test.ts`

**Interfaces:**
- Adds `attachments?: BusinessAttachment[]` to `OrderPayment`.
- Adds `dealEvidenceAttachments?: BusinessAttachment[]` to `Order`.
- Keeps `voucherName`, `voucherPreview`, `dealEvidenceName`, and `dealEvidencePreview` for read compatibility.

- [ ] **Step 1: Add failing order limit and compatibility tests**

```ts
assert.equal((await service.submit({ ...input, payments: [{ ...payment, attachments: twoPaymentImages }] }, actor)).code, 400);
assert.equal((await service.submit({ ...input, dealEvidenceAttachments: eightImages }, actor)).code, 0);
assert.equal(normalizeOrderAttachments(legacyOrder).payments[0].attachments?.length, 1);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec tsx server/services/orderApplicationService.test.ts && pnpm exec tsx src/api/orderReviewApi.test.ts`
Expected: FAIL on missing arrays/validation.

- [ ] **Step 3: Implement order persistence and UI**

Use `BusinessAttachmentPicker` with `maxCount={1}` and `rejectWholeBatchOnOverflow` for payment proof, and `maxCount={8}` for deal evidence. OCR reads the sole payment attachment through its authenticated content URL. Preserve legacy preview rendering when no array exists.

- [ ] **Step 4: Verify order detail and review behavior**

Run: `pnpm exec tsx server/services/orderApplicationService.test.ts && pnpm exec tsx server/services/orderApprovalEffectsService.test.ts && pnpm exec tsx src/api/orderReviewApi.test.ts && pnpm exec tsc -b --pretty false`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/types/order.ts src/pages/Orders/OrderForm.tsx src/api/orderReviewApi.ts src/api/orderApi.ts server/services/orderApplicationService.ts server/services/orderApplicationService.test.ts server/services/orderCommandService.ts server/services/orderApprovalEffectsService.ts server/services/orderApprovalEffectsService.test.ts src/pages/OrderReview/index.tsx src/pages/Orders/OrderDetail.tsx src/api/orderReviewApi.test.ts
git commit -m "feat: support order evidence attachments"
```

### Task 5: After-sales source configuration

**Files:**
- Create: `src/types/afterSalesSource.ts`
- Create: `server/services/afterSalesSourceService.ts`
- Test: `server/services/afterSalesSourceService.test.ts`
- Create: `src/api/afterSalesSourceApi.ts`
- Create: `src/pages/Settings/AfterSalesSourceConfig.tsx`
- Modify: `src/shared/utils/constants.ts`
- Modify: `src/shared/utils/permissions.ts`
- Modify: `src/shared/utils/organizationConfig.ts`
- Modify: `src/pages/Settings/RolePermission.tsx`
- Modify: `src/pages/Settings/index.tsx`
- Modify: `src/layouts/Sidebar.tsx`
- Modify: `server/index.ts`

**Interfaces:**
- Produces `AfterSalesPlatform { id, name, isActive, sortOrder, shops }`.
- Produces read/write settings routes guarded by `SETTINGS_AFTER_SALES_SOURCES`.
- Produces `afterSalesSourceApi.list()` and CRUD methods.

- [ ] **Step 1: Write failing configuration tests**

```ts
assert.equal((await service.createPlatform({ name: '抖音', isActive: true, sortOrder: 1 }, admin)).code, 0);
assert.equal((await service.createPlatform({ name: '抖音', isActive: true, sortOrder: 2 }, admin)).code, 409);
assert.equal((await service.createShop(platformId, { name: '极享智能体', isActive: true, sortOrder: 1 }, admin)).data?.platformId, platformId);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec tsx server/services/afterSalesSourceService.test.ts`
Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement service, permission, API, and settings page**

Persist one configuration record under `STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIG`. Reject duplicate active names within the same level. Prevent deleting a platform with shops; allow disabling. Add the settings page under a new `售后设置` group.

- [ ] **Step 4: Verify settings and permission tests**

Run: `pnpm exec tsx server/services/afterSalesSourceService.test.ts && pnpm exec tsx src/api/permissionModel.test.ts && pnpm exec tsx server/storageRoutesAuth.test.ts && pnpm exec tsc -b --pretty false`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/types/afterSalesSource.ts server/services/afterSalesSourceService.ts server/services/afterSalesSourceService.test.ts src/api/afterSalesSourceApi.ts src/pages/Settings/AfterSalesSourceConfig.tsx src/shared/utils/constants.ts src/shared/utils/permissions.ts src/shared/utils/organizationConfig.ts src/pages/Settings/RolePermission.tsx src/pages/Settings/index.tsx src/layouts/Sidebar.tsx server/index.ts src/api/permissionModel.test.ts server/storageRoutesAuth.test.ts
git commit -m "feat: configure after-sales platforms and shops"
```

### Task 6: Recovery contact rule, sources, and multi-attachments

**Files:**
- Modify: `src/types/recoveryOrder.ts`
- Modify: `server/services/recoveryOrderCommandService.ts`
- Modify: `server/services/recoveryOrderCommandService.test.ts`
- Modify: `src/api/recoveryOrderApi.ts`
- Modify: `src/pages/AfterSales/RecoveryOrderTab.tsx`
- Modify: `src/pages/Finance/RecoverySettlement.tsx`

**Interfaces:**
- Adds `paymentAttachments`, `chatAttachments`, `sourcePlatformId`, `sourcePlatformName`, `sourceShopId`, `sourceShopName`.
- Retains old single evidence fields for compatibility.
- Consumes Task 3 picker and Task 5 source API.

- [ ] **Step 1: Write failing recovery validation tests**

```ts
assert.equal((await service.create({ ...input, customerPhone: '', customerWechat: '' }, actor)).message, '手机号或微信至少填写一项');
assert.equal((await service.create({ ...input, customerPhone: '13800000000', paymentAttachments: eight }, actor)).code, 0);
assert.equal((await service.create({ ...input, customerPhone: '13800000000', paymentAttachments: nine }, actor)).code, 400);
assert.equal((await service.create({ ...input, sourcePlatformId: disabledPlatformId }, actor)).code, 409);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec tsx server/services/recoveryOrderCommandService.test.ts`
Expected: FAIL on contact/source/attachment rules.

- [ ] **Step 3: Implement command validation and form**

Require name plus phone-or-WeChat on create and update. Load active platform/shop options, clear shop when platform changes, and save IDs plus snapshots. Render old and new evidence in detail/review/settlement views.

- [ ] **Step 4: Verify recovery tests and typecheck**

Run: `pnpm exec tsx server/services/recoveryOrderCommandService.test.ts && pnpm exec tsx server/services/recoveryOrderQueryService.test.ts && pnpm exec tsc -b --pretty false`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/types/recoveryOrder.ts server/services/recoveryOrderCommandService.ts server/services/recoveryOrderCommandService.test.ts src/api/recoveryOrderApi.ts src/pages/AfterSales/RecoveryOrderTab.tsx src/pages/Finance/RecoverySettlement.tsx
git commit -m "feat: improve recovery order evidence and sources"
```

### Task 7: Real delivery attachment lifecycle

**Files:**
- Modify: `src/types/delivery.ts`
- Modify: `server/services/deliveryCommandService.ts`
- Modify: `server/services/deliveryCommandService.test.ts`
- Modify: `src/api/deliveryApi.ts`
- Modify: `src/pages/Delivery/index.tsx`
- Modify: `server/index.ts`

**Interfaces:**
- Replaces metadata-only delivery task uploads with Task 2 attachment references.
- Adds authenticated preview/download/delete actions.

- [ ] **Step 1: Write failing delivery attachment tests**

```ts
const added = await service.addAttachment(deliveryId, taskId, attachmentRef, actor);
assert.equal(added.data?.tasks[0].attachments?.[0].id, attachmentRef.id);
const removed = await service.removeAttachment(deliveryId, taskId, attachmentRef.id, actor);
assert.equal(removed.data?.tasks[0].attachments?.length, 0);
assert.equal((await service.removeAttachment(deliveryId, taskId, attachmentRef.id, outsider)).code, 403);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec tsx server/services/deliveryCommandService.test.ts`
Expected: FAIL because deletion and real association are missing.

- [ ] **Step 3: Implement association, download, preview, and delete UI**

Upload through `BusinessAttachmentPicker` with delivery file MIME options and 20 MB maximum. Show thumbnails for images and file rows for documents. Deletion must remove both the task association and physical attachment through Task 2 service.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec tsx server/services/deliveryCommandService.test.ts && pnpm exec tsx src/api/deliveryApi.test.ts && pnpm exec tsc -b --pretty false`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/types/delivery.ts server/services/deliveryCommandService.ts server/services/deliveryCommandService.test.ts src/api/deliveryApi.ts src/pages/Delivery/index.tsx server/index.ts
git commit -m "feat: persist delivery task attachments"
```

### Task 8: Delivery step save feedback and completion timestamps

**Files:**
- Modify: `src/pages/Delivery/index.tsx`
- Create: `src/pages/Delivery/deliveryTaskDraftState.ts`
- Create: `src/pages/Delivery/deliveryTaskDraftState.test.ts`
- Modify: `server/services/deliveryCommandService.ts`
- Modify: `server/services/deliveryCommandService.test.ts`
- Modify: `src/api/deliveryApi.test.ts`

**Interfaces:**
- Adds a per-task save action using existing `updateDeliveryTask`.
- Produces `taskDraftChanged(saved, draft): boolean` for explicit dirty-state tracking.
- Displays `actualCompletedAt`, `completedAt`, and `completedBy` without deriving completion time from `updatedAt`.

- [ ] **Step 1: Add failing completion/save tests**

```ts
const saved = await service.updateTask(deliveryId, taskId, { resultFields: { note: '已完成备案' } }, actor);
assert.equal(saved.data?.tasks[0].resultFields?.note, '已完成备案');
assert.equal(saved.data?.tasks[0].status, '待开始');
const confirmed = await service.confirmCompletion(deliveryId, '验收通过', supervisor);
assert.equal(confirmed.data?.actualCompletedAt, NOW);
assert.equal(taskDraftChanged({ note: '' }, { note: '已完成备案' }), true);
assert.equal(taskDraftChanged({ note: '已完成备案' }, { note: '已完成备案' }), false);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec tsx src/pages/Delivery/deliveryTaskDraftState.test.ts`
Expected: FAIL because `deliveryTaskDraftState.ts` does not exist.

- [ ] **Step 3: Implement explicit save state**

Track server values separately from drafts, mark a task dirty when fields differ, show `未保存`, disable its button while saving, replace it with `已保存 HH:mm:ss` after success, and preserve the draft on failure. Add a close confirmation when any task is dirty.

```ts
export function taskDraftChanged(saved: Record<string, string> = {}, draft: Record<string, string> = {}): boolean {
  const compact = (value: Record<string, string>) => Object.fromEntries(
    Object.entries(value).filter(([, text]) => text.trim()).sort(([left], [right]) => left.localeCompare(right)),
  );
  return JSON.stringify(compact(saved)) !== JSON.stringify(compact(draft));
}
```

- [ ] **Step 4: Add completion displays**

Add an `actualCompletedAt` list column and render `完成于 <time> · <completedBy>` below each completed task. Keep planned and actual completion columns separate.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm exec tsx src/pages/Delivery/deliveryTaskDraftState.test.ts && pnpm exec tsx server/services/deliveryCommandService.test.ts && pnpm exec tsx src/api/deliveryApi.test.ts && pnpm exec tsc -b --pretty false`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Delivery/index.tsx src/pages/Delivery/deliveryTaskDraftState.ts src/pages/Delivery/deliveryTaskDraftState.test.ts server/services/deliveryCommandService.ts server/services/deliveryCommandService.test.ts src/api/deliveryApi.test.ts
git commit -m "feat: clarify delivery save and completion state"
```

### Task 9: Compact list payloads and cross-view compatibility

**Files:**
- Modify: `src/shared/utils/listPayload.ts`
- Modify: `src/shared/utils/listPayload.test.ts`
- Modify: `server/services/orderQueryService.test.ts`
- Modify: `server/services/recoveryOrderCommandService.test.ts`
- Modify: `server/services/deliveryQueryService.test.ts`

**Interfaces:**
- List payloads retain attachment ID/name/type/size but never file bytes, Base64 payloads, storage paths, or upload buffers.

- [ ] **Step 1: Write failing compact-payload tests**

```ts
const compact = compactOrderListItem(orderWithNewAndLegacyEvidence);
assert.equal(compact.dealEvidencePreview, undefined);
assert.equal(compact.dealEvidenceAttachments?.[0].name, 'chat.png');
assert.equal(JSON.stringify(compact).includes('data:image/'), false);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec tsx src/shared/utils/listPayload.test.ts`
Expected: FAIL because new arrays are not normalized/compacted.

- [ ] **Step 3: Implement compact metadata mapping**

Map every attachment to the public `BusinessAttachment` fields only. Keep legacy inline preview removal unchanged.

- [ ] **Step 4: Run query regressions**

Run: `pnpm exec tsx src/shared/utils/listPayload.test.ts && pnpm exec tsx server/services/orderQueryService.test.ts && pnpm exec tsx server/services/deliveryQueryService.test.ts`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/utils/listPayload.ts src/shared/utils/listPayload.test.ts server/services/orderQueryService.test.ts server/services/recoveryOrderCommandService.test.ts server/services/deliveryQueryService.test.ts
git commit -m "perf: keep attachment list payloads compact"
```

### Task 10: Full verification and release evidence

**Files:**
- Modify: `BUG_FIX_LOG.md`
- Modify: `CHANGELOG.md`
- Create: `scripts/qa/business-attachment-smoke.ts`

**Interfaces:**
- Produces a destructive-safe local smoke test that refuses non-loopback API hosts and non-QA databases, following existing QA script guards.

- [ ] **Step 1: Add the local integration smoke**

The script logs in as isolated QA users, uploads order/recovery/delivery evidence, verifies authorized reads, verifies an unrelated user receives 403, deletes a delivery attachment, and asserts the stored business JSON contains metadata but no `data:image/` payload.

- [ ] **Step 2: Run focused verification**

Run: `pnpm exec tsx src/shared/utils/attachmentSelection.test.ts && pnpm exec tsx server/services/businessAttachmentService.test.ts && pnpm exec tsx server/services/afterSalesSourceService.test.ts && pnpm exec tsx server/services/orderApplicationService.test.ts && pnpm exec tsx server/services/recoveryOrderCommandService.test.ts && pnpm exec tsx server/services/deliveryCommandService.test.ts`
Expected: exit 0.

- [ ] **Step 3: Run full repository gates**

Run: `pnpm exec tsc -b --pretty false && pnpm test && pnpm run build && pnpm exec prisma validate`
Expected: all commands exit 0. Do not report lint because the repository has no lint script.

- [ ] **Step 4: Run the QA smoke against an isolated local database**

Run:

```bash
QA_API_BASE=http://127.0.0.1:3001/api \
DATABASE_URL="$DATABASE_URL" \
QA_DATABASE_NAME=jixiang_os_qa QA_ALLOW_DESTRUCTIVE_DB=true \
QA_ADMIN_ACCOUNT="$QA_ADMIN_ACCOUNT" QA_ADMIN_PASSWORD="$QA_ADMIN_PASSWORD" \
QA_SALES_ACCOUNT="$QA_SALES_ACCOUNT" QA_SALES_PASSWORD="$QA_SALES_PASSWORD" \
pnpm exec tsx scripts/qa/business-attachment-smoke.ts
```

Expected: the script prints a success summary and exits 0; otherwise report the missing local credentials as an unrun environment-dependent check.

- [ ] **Step 5: Review the complete implementation diff**

Compare from design commit `a38bc06` through `HEAD`. Check every spec section, permission boundary, legacy view, and attachment limit. Fix findings and rerun the affected test plus the full gates.

- [ ] **Step 6: Update release notes and commit**

```bash
git add BUG_FIX_LOG.md CHANGELOG.md scripts/qa/business-attachment-smoke.ts
git commit -m "test: verify business attachment workflows"
```
