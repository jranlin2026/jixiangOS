# Customer and Lead Social Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WeChat nickname, Douyin ID, and Douyin nickname to customer and lead create/edit/detail flows, align lead detail grouping with customer detail, and preserve the fields across lead-to-customer conversion and customer-to-origin-lead synchronization.

**Architecture:** Keep the three optional values in the existing Customer and Lead JSON business records and centralize their normalization and summary formatting in a shared pure utility. Customer and lead screens reuse the same social-profile field order while retaining separate form state and accordion persistence. Server command services remain authoritative for validation, audit history, conversion mapping, and transactional synchronization.

**Tech Stack:** React 18, TypeScript, Material UI, Zustand API clients, Express service layer, Prisma/MySQL JSON business records, Node `assert` tests executed with `tsx`.

## Global Constraints

- `wechatNickname`, `douyinId`, and `douyinNickname` are optional single-line strings with a maximum length of 100 characters.
- The three new fields do not participate in duplicate detection, contact identity locks, or unique indexes.
- `wechat` remains the existing WeChat identity field and retains its current duplicate-detection and lock behavior.
- Lead-to-customer conversion copies all four social fields; later customer edits synchronize the uniquely resolved origin lead.
- Customer and lead details use the same five groups but persist accordion state separately per employee.
- This plan does not add list columns, search filters, batch editing, or import/export columns.
- Existing unrelated working-tree changes must not be staged or modified.

---

### Task 1: Shared social-profile model and pure rules

**Files:**
- Modify: `src/types/customer.ts`
- Modify: `src/types/lead.ts`
- Create: `src/shared/utils/socialProfile.ts`
- Create: `src/shared/utils/socialProfile.test.ts`

**Interfaces:**
- Produces: `SocialProfileFields`, `SOCIAL_PROFILE_FIELD_KEYS`, `normalizeOptionalSocialProfileValue(value, label)`, and `formatSocialProfileSummary(profile)`.
- Consumed by: customer/lead forms, customer/lead details, and server command validation.

- [ ] **Step 1: Write the failing utility test**

```ts
assert.equal(normalizeOptionalSocialProfileValue('  极享AI  ', '抖音昵称'), '极享AI');
assert.equal(normalizeOptionalSocialProfileValue('   ', '微信昵称'), undefined);
assert.throws(() => normalizeOptionalSocialProfileValue('a'.repeat(101), '抖音号'), /不能超过100个字符/);
assert.throws(() => normalizeOptionalSocialProfileValue('第一行\n第二行', '微信昵称'), /不能包含换行/);
assert.equal(formatSocialProfileSummary({ wechatNickname: '王总', douyinNickname: '极享AI' }), '微信：王总 · 抖音：极享AI');
assert.equal(formatSocialProfileSummary({ wechat: 'wx_001', douyinId: 'dy_001' }), '微信：wx_001 · 抖音：dy_001');
assert.equal(formatSocialProfileSummary({}), '暂未填写社交账号');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx src/shared/utils/socialProfile.test.ts`  
Expected: FAIL because `socialProfile.ts` does not exist.

- [ ] **Step 3: Add fields and implement the shared rules**

```ts
export type SocialProfileFields = {
  wechat?: string;
  wechatNickname?: string;
  douyinId?: string;
  douyinNickname?: string;
};

export const SOCIAL_PROFILE_FIELD_KEYS = ['wechatNickname', 'douyinId', 'douyinNickname'] as const;

export function normalizeOptionalSocialProfileValue(value: unknown, label: string): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (/[\r\n]/.test(text)) throw new Error(`${label}不能包含换行`);
  if (text.length > 100) throw new Error(`${label}不能超过100个字符`);
  return text;
}
```

Add `wechatNickname?: string`, `douyinId?: string`, and `douyinNickname?: string` to both `Customer` and `Lead`.

- [ ] **Step 4: Run the utility test and verify GREEN**

Run: `npx tsx src/shared/utils/socialProfile.test.ts`  
Expected: `social profile tests passed`.

- [ ] **Step 5: Commit the model unit**

```bash
git add src/types/customer.ts src/types/lead.ts src/shared/utils/socialProfile.ts src/shared/utils/socialProfile.test.ts
git commit -m "feat: add customer and lead social profile model"
```

---

### Task 2: Customer and lead create/edit forms

**Files:**
- Modify: `src/pages/Customers/CustomerForm.tsx`
- Modify: `src/pages/Leads/LeadForm.tsx`
- Create: `src/pages/Customers/socialProfileFormsStatic.test.ts`

**Interfaces:**
- Consumes: `normalizeOptionalSocialProfileValue` and the three typed fields from Task 1.
- Produces: form payloads that include normalized `wechatNickname`, `douyinId`, and `douyinNickname`.

- [ ] **Step 1: Write a failing static form contract test**

The test reads both form source files and asserts each contains the labels `微信昵称`, `抖音号`, `抖音昵称`, initializes all three form keys, and submits all three keys. It also asserts the existing `missingContact` expression still uses only phone, alternate phone, and `wechat`.

- [ ] **Step 2: Run the form test and verify RED**

Run: `npx tsx src/pages/Customers/socialProfileFormsStatic.test.ts`  
Expected: FAIL because the new labels and form keys are absent.

- [ ] **Step 3: Extend both form states and payloads**

Initialize each form with:

```ts
wechatNickname: '',
douyinId: '',
douyinNickname: '',
```

When editing, load `customer?.wechatNickname || ''` or `lead?.wechatNickname || ''` and the matching Douyin fields. Before submission, normalize the three fields with the Task 1 helper and surface its exact validation error through the existing feedback dialog.

- [ ] **Step 4: Add the visible social account fields**

In both create forms, place a full-width “社交账号” subheading inside the first business information step, followed by the four fields in this order: 微信号、微信昵称、抖音号、抖音昵称. Use the existing two-column grid on desktop and one-column grid on mobile. Apply the same order to edit forms.

- [ ] **Step 5: Run focused form and API tests**

Run:

```bash
npx tsx src/pages/Customers/socialProfileFormsStatic.test.ts
npx tsx src/api/customerApi.test.ts
npx tsx src/api/leadApi.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit the form unit**

```bash
git add src/pages/Customers/CustomerForm.tsx src/pages/Leads/LeadForm.tsx src/pages/Customers/socialProfileFormsStatic.test.ts
git commit -m "feat: capture social profiles in CRM forms"
```

---

### Task 3: Customer and lead grouped details

**Files:**
- Modify: `src/pages/Customers/customerDetailSections.ts`
- Modify: `src/pages/Customers/customerDetailSections.test.ts`
- Modify: `src/pages/Customers/CustomerDetail.tsx`
- Create: `src/pages/Leads/leadDetailSections.ts`
- Create: `src/pages/Leads/leadDetailSections.test.ts`
- Modify: `src/pages/Leads/LeadDetail.tsx`

**Interfaces:**
- Consumes: `formatSocialProfileSummary` from Task 1.
- Produces: five accordion keys for each detail and employee-scoped persistence keys.

- [ ] **Step 1: Extend customer section tests and add failing lead section tests**

Assert both section models normalize these keys:

```ts
{
  basic: true,
  social: false,
  attribution: false,
  platform: false,
  ownership: false,
}
```

Assert `editableCustomerDetailSections` and `editableLeadDetailSections` set `basic` and `social` to `true`. Assert customer and lead storage-key prefixes are different.

- [ ] **Step 2: Run section tests and verify RED**

Run:

```bash
npx tsx src/pages/Customers/customerDetailSections.test.ts
npx tsx src/pages/Leads/leadDetailSections.test.ts
```

Expected: FAIL because customer lacks `social` and the lead model is absent.

- [ ] **Step 3: Add customer social accordion**

Move the existing 微信号 row out of “基本资料” and render a “社交账号” accordion with 微信号、微信昵称、抖音号、抖音昵称. Use `formatSocialProfileSummary(currentCustomer)` for its summary. Editing opens the basic and social groups; existing permission checks still govern the fields.

- [ ] **Step 4: Refactor lead detail into the same five groups**

Create a lead section state with storage key prefix `jixiangos_lead_detail_sections_v1`, suffixed by `currentUser.id`. Replace the flat left-hand rows with five accordions matching customer order. Preserve current edit, claim, assignment, history, permission, and contact-phone behavior. The social accordion uses the shared summary and all four social fields.

- [ ] **Step 5: Run detail tests**

Run:

```bash
npx tsx src/pages/Customers/customerDetailSections.test.ts
npx tsx src/pages/Leads/leadDetailSections.test.ts
npx tsx src/pages/Leads/leadDetailRules.test.ts
npx tsx src/pages/Customers/customerDetailPolicy.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit the detail unit**

```bash
git add src/pages/Customers/CustomerDetail.tsx src/pages/Customers/customerDetailSections.ts src/pages/Customers/customerDetailSections.test.ts src/pages/Leads/LeadDetail.tsx src/pages/Leads/leadDetailSections.ts src/pages/Leads/leadDetailSections.test.ts
git commit -m "feat: group customer and lead social profiles"
```

---

### Task 4: Server validation, audit, conversion, and origin-lead sync

**Files:**
- Modify: `server/services/customerAccessPolicy.ts`
- Modify: `server/services/customerCommandService.ts`
- Modify: `server/services/customerCommandService.test.ts`

**Interfaces:**
- Consumes: three fields and `normalizeOptionalSocialProfileValue` from Task 1.
- Produces: authoritative create/edit normalization and transactional cross-record synchronization.

- [ ] **Step 1: Add failing service tests**

Extend the existing customer/lead command fixtures with the three new fields and add assertions with this shape:

```ts
assert.equal(createdLead.data?.wechatNickname, '王总');
assert.equal(createdLead.data?.douyinId, 'dy_001');
assert.equal(createdLead.data?.douyinNickname, '极享AI');

assert.equal(convertedCustomer?.wechatNickname, sourceLead.wechatNickname);
assert.equal(convertedCustomer?.douyinId, sourceLead.douyinId);
assert.equal(convertedCustomer?.douyinNickname, sourceLead.douyinNickname);

assert.equal(updatedCustomer.activityRecords?.[0].changes?.some(
  (change) => change.field === 'douyinNickname' && change.newValue === '新昵称',
), true);
assert.equal(originLead.data.douyinNickname, '新昵称');

const tooLong = await service.updateCustomer(customer.id, { douyinId: 'a'.repeat(101) }, actor);
assert.equal(tooLong.code, 400);
assert.match(tooLong.message, /抖音号不能超过100个字符/);

const multiline = await service.updateLead(lead.id, { wechatNickname: '第一行\n第二行' }, actor);
assert.equal(multiline.code, 400);
assert.match(multiline.message, /微信昵称不能包含换行/);
```

For the ambiguity case, provide two active stable `customerId` lead rows without a matching customer `relatedId`, capture `onProfileSyncWarning`, and assert neither lead is updated and the warning code is `AMBIGUOUS_ORIGIN_LEAD`. Keep the existing rollback fixture and make its origin-lead update throw; assert the customer persistence is rolled back by the fixture transaction.

- [ ] **Step 2: Run the focused service test and verify RED**

Run: `npx tsx server/services/customerCommandService.test.ts`  
Expected: FAIL on missing social fields and validation.

- [ ] **Step 3: Add editable-field and audit labels**

Add the three keys to customer profile fields and lead profile fields with labels 微信昵称、抖音号、抖音昵称. Normalize all three after editable-patch extraction and before constructing merged records. Return the helper error as a 400 response.

- [ ] **Step 4: Add creation and conversion mappings**

Copy the three fields through direct customer creation, direct lead creation, automatic customer creation, manual lead conversion, and `syncLeadFromCustomer`. Do not add them to `CustomerContact`, contact collision queries, or contact identity links.

- [ ] **Step 5: Restrict customer synchronization to the origin lead**

Resolve the origin lead from the customer creation activity/audit `relatedId`; for legacy data, fall back only when exactly one active stable `customerId` lead exists. Add this optional dependency to `CommandOptions`:

```ts
onProfileSyncWarning?: (warning: {
  code: 'AMBIGUOUS_ORIGIN_LEAD';
  customerId: string;
  linkedLeadIds: string[];
}) => void;
```

Synchronize inside the existing customer update transaction. If more than one active link exists without an origin marker, skip fan-out, call `onProfileSyncWarning` with sorted lead IDs, and do not fail customer save.

- [ ] **Step 6: Run service and security regression tests**

Run:

```bash
npx tsx server/services/customerCommandService.test.ts
npx tsx server/services/contactIdentityService.test.ts
npx tsx src/api/customerLeadProfileSecurityStatic.test.ts
```

Expected: all pass; existing WeChat duplicate and lock cases remain unchanged.

- [ ] **Step 7: Commit the service unit**

```bash
git add server/services/customerAccessPolicy.ts server/services/customerCommandService.ts server/services/customerCommandService.test.ts
git commit -m "feat: synchronize CRM social profiles"
```

---

### Task 5: Full verification and visual QA

**Files:**
- Modify only files from Tasks 1-4 if verification reveals a defect.

**Interfaces:**
- Consumes: the completed feature.
- Produces: verified desktop/mobile create, detail, edit, and conversion behavior.

- [ ] **Step 1: Run all focused tests**

Run every `tsx` test listed in Tasks 1-4.  
Expected: all pass.

- [ ] **Step 2: Run typecheck and production build**

Run:

```bash
npx tsc --noEmit
npx vite build
```

Expected: both pass, or only documented unrelated baseline failures remain with no errors in touched files.

- [ ] **Step 3: Run the repository test suite**

Run: `DATABASE_URL='' npm test`  
Expected: pass, or document exact unrelated failures already present outside this feature.

- [ ] **Step 4: Verify in the local browser**

At `http://127.0.0.1:3000/customers?tab=active` and the lead management page, verify desktop and narrow mobile viewports for: create form field order, five detail groups, social summary, per-employee persistence, edit auto-expansion, saved values, and no horizontal overflow. Do not create persistent production data; use local test records only.

- [ ] **Step 5: Review the branch diff and commit fixes**

Run:

```bash
git diff --check
git diff d8abd13...HEAD -- src server
```

Stage only feature-owned files and commit any verification fixes with `fix: complete CRM social profile verification`.
