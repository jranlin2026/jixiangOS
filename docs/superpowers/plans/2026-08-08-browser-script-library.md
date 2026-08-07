# Unified Browser Script Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the extension's hard-coded reply cards with a company-wide, administrator-managed script library that supports groups, deterministic matching, and safe auto-fill without automatic sending.

**Architecture:** Store one versioned `ScriptLibrary` document in Prisma `appStorage` behind authenticated browser-agent endpoints. Keep validation and permissions on the server, matching as a pure extension domain module, page writing inside the existing Feige adapter, and React rendering/editing in focused side-panel components.

**Tech Stack:** TypeScript, Express, Prisma/MySQL `appStorage`, React 18, Chrome Extension Manifest V3, Node `assert`, JSDOM, esbuild.

## Global Constraints

- Company-wide library; browser-local storage is cache only.
- Only a super administrator can change configuration; lead-entry users can read enabled scripts.
- Match inputs are order status, product keywords, contact state, and numeric priority.
- Auto-fill only when order number and order status are recognized and the Feige reply field is empty.
- Never overwrite human input and never click the Feige send button.
- Existing customer recognition, contact detection, lead intake, sales notification, and order remark flows must keep working.
- Do not enable guessed order-status selectors; real Feige order DOM must be calibrated before status-driven auto-fill can activate.

---

## File Map

- `server/services/browserAgent/scriptLibraryService.ts`: canonical library model, defaults, validation, revision checks, permissions, and `appStorage` persistence.
- `server/services/browserAgent/scriptLibraryService.test.ts`: service-level behavior and permission tests.
- `server/routes/browserAgentRoutes.ts`: authenticated GET/PUT library endpoints alongside lead intake.
- `server/routes/browserAgentRoutes.test.ts`: HTTP contract for library endpoints.
- `server/index.ts`: construct and inject the script-library service.
- `src/shared/utils/constants.ts`: add the `BROWSER_EMPLOYEE_SCRIPT_LIBRARY` storage key.
- `apps/browser-extension/src/domain/scriptLibrary.ts`: extension contract normalization and deterministic matcher.
- `apps/browser-extension/src/domain/scriptLibrary.test.ts`: matcher and fallback tests.
- `apps/browser-extension/src/shared/contracts.ts`: worker messages, API view, and page command/result additions.
- `apps/browser-extension/src/background/serviceWorker.ts`: GET/PUT proxy calls to 极享OS.
- `apps/browser-extension/src/content/douyinFeigeAdapter.ts`: expose `orderStatus`, read reply text, and fill only when empty.
- `apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`: empty/non-empty editor and no-order status cases.
- `apps/browser-extension/src/sidepanel/ScriptLibrarySection.tsx`: grouped script browsing and recommendation presentation.
- `apps/browser-extension/src/sidepanel/ScriptLibraryEditor.tsx`: administrator group/script editing and condition forms.
- `apps/browser-extension/src/sidepanel/main.tsx`: load/save library and connect matching to refreshed Feige context.
- `apps/browser-extension/public/sidepanel.css`: group tabs, editor, condition fields, and recommendation styles.
- `docs/ai-browser-employee-mvp.md`: operating instructions and automation safety boundary.

---

### Task 1: Server Script-Library Domain and Persistence

**Files:**
- Create: `server/services/browserAgent/scriptLibraryService.ts`
- Create: `server/services/browserAgent/scriptLibraryService.test.ts`
- Modify: `src/shared/utils/constants.ts`

**Interfaces:**
- Consumes: Prisma `appStorage`, `AuthenticatedUser`, `isSuperAdmin`, `success`, and `failure`.
- Produces: `createBrowserScriptLibraryService(prisma)`, `BrowserScriptLibraryService`, `ScriptLibrary`, `ScriptLibraryView`, and `DEFAULT_SCRIPT_LIBRARY`.

- [ ] **Step 1: Write the failing default/read/permission test**

```ts
const read = await service.get(agent);
assert.equal(read.code, 0);
assert.equal(read.data?.canManage, false);
assert.equal(read.data?.library.groups[0].name, '下单客户');

const denied = await service.update({ revision: 1, groups: [] }, agent);
assert.equal(denied.code, 403);
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `npx tsx server/services/browserAgent/scriptLibraryService.test.ts`

Expected: FAIL because `scriptLibraryService.ts` does not exist.

- [ ] **Step 3: Add the storage key and minimal default/read/update service**

Add:

```ts
BROWSER_EMPLOYEE_SCRIPT_LIBRARY: `${STORAGE_PREFIX}browser_employee_script_library_v1`,
```

Implement:

```ts
export function createBrowserScriptLibraryService(prisma: Pick<PrismaClient, 'appStorage'>) {
  return {
    async get(actor: AuthenticatedUser): Promise<ApiResponse<ScriptLibraryView>>,
    async update(input: unknown, actor: AuthenticatedUser): Promise<ApiResponse<ScriptLibraryView>>,
  };
}
```

Use the three approved initial scripts under `下单客户`, with empty match conditions and `revision: 1`. Persist the default on the first successful administrator update, not during read.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npx tsx server/services/browserAgent/scriptLibraryService.test.ts`

Expected: PASS for default read, `canManage`, and non-admin rejection.

- [ ] **Step 5: Add one failing validation and revision-conflict test**

```ts
assert.equal((await service.update(duplicateIdLibrary, admin)).code, 400);
assert.equal((await service.update({ ...validLibrary, revision: 0 }, admin)).code, 409);
```

- [ ] **Step 6: Implement complete validation and optimistic revision update**

Validation must enforce:

- schema version exactly `1`;
- unique non-empty group and script IDs;
- group name 1–80 characters;
- script title 1–120 characters and content 1–2000 characters;
- contact state in `ANY | MISSING | PRESENT`;
- priority integer from `-1000` to `1000`;
- normalized unique order statuses and product keywords;
- current stored revision equals submitted revision.

Write `updatedAt`, `updatedBy`, and incremented revision on the server.

- [ ] **Step 7: Run the service test**

Run: `npx tsx server/services/browserAgent/scriptLibraryService.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the server domain slice**

```bash
git add src/shared/utils/constants.ts server/services/browserAgent/scriptLibraryService.ts server/services/browserAgent/scriptLibraryService.test.ts
git commit -m "feat: add unified browser script library service"
```

---

### Task 2: Browser-Agent HTTP API and Server Wiring

**Files:**
- Modify: `server/routes/browserAgentRoutes.ts`
- Modify: `server/routes/browserAgentRoutes.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `BrowserScriptLibraryService.get(actor)` and `.update(input, actor)` from Task 1.
- Produces: `GET /api/browser-agent/script-library` and `PUT /api/browser-agent/script-library`.

- [ ] **Step 1: Extend the route test with failing GET and PUT assertions**

```ts
const library = await fetch(`${base}/api/browser-agent/script-library`);
assert.equal(library.status, 200);

const saved = await fetch(`${base}/api/browser-agent/script-library`, {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: 1, groups: [] }),
});
assert.equal(saved.status, 200);
```

- [ ] **Step 2: Run the route test and confirm 404**

Run: `npx tsx server/routes/browserAgentRoutes.test.ts`

Expected: FAIL because both library routes are absent.

- [ ] **Step 3: Add the service dependency and routes**

Extend router dependencies with:

```ts
scriptLibrary: BrowserScriptLibraryService;
```

Both routes use `requireLeadCreate` for authentication and lead-entry authorization. The PUT service performs the stronger super-admin check.

- [ ] **Step 4: Wire the service in `server/index.ts`**

```ts
const browserScriptLibraryService = createBrowserScriptLibraryService(prisma);
createBrowserAgentRouter({
  service: browserLeadIntakeService,
  scriptLibrary: browserScriptLibraryService,
  requireLeadCreate: requireLeadCreateAccess,
});
```

- [ ] **Step 5: Run route, service, and root type checks**

Run:

```bash
npx tsx server/routes/browserAgentRoutes.test.ts
npx tsx server/services/browserAgent/scriptLibraryService.test.ts
npx tsc -b --pretty false
```

Expected: all PASS.

- [ ] **Step 6: Commit the API slice**

```bash
git add server/routes/browserAgentRoutes.ts server/routes/browserAgentRoutes.test.ts server/index.ts
git commit -m "feat: expose browser script library API"
```

---

### Task 3: Extension Script Contract and Deterministic Matcher

**Files:**
- Create: `apps/browser-extension/src/domain/scriptLibrary.ts`
- Create: `apps/browser-extension/src/domain/scriptLibrary.test.ts`
- Modify: `apps/browser-extension/src/shared/contracts.ts`
- Modify: `apps/browser-extension/src/background/serviceWorker.ts`
- Modify: `apps/browser-extension/package.json`

**Interfaces:**
- Consumes: `ScriptLibraryView` JSON from Task 2 and `{ orderStatus, productName, hasContact }` page facts.
- Produces: `matchScript(library, facts): ScriptMatch | null`, `GET_SCRIPT_LIBRARY`, and `SAVE_SCRIPT_LIBRARY` worker commands.

- [ ] **Step 1: Write the failing matcher priority test**

```ts
const match = matchScript(library, {
  orderStatus: '已付款', productName: 'N哥IP口播智能体', hasContact: false,
});
assert.equal(match?.script.id, 'script-paid-product-missing-contact');
```

- [ ] **Step 2: Run and confirm the missing matcher failure**

Run: `npx tsx apps/browser-extension/src/domain/scriptLibrary.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement normalized types and matcher**

`matchScript` must filter disabled groups/scripts, require every configured condition, and sort by priority, specificity, group sort, script sort, then script ID.

Return:

```ts
type ScriptMatch = {
  group: ScriptGroup;
  script: ScriptTemplate;
  reasons: string[];
};
```

- [ ] **Step 4: Add tests for no status, contact state, keyword mismatch, and stable ties**

No recognized order status must always return `null`, even for a script with empty order-status conditions, because auto-fill is status-driven.

- [ ] **Step 5: Add worker API commands**

```ts
| { type: 'GET_SCRIPT_LIBRARY' }
| { type: 'SAVE_SCRIPT_LIBRARY'; library: ScriptLibrary }
```

Map them to GET and PUT `/browser-agent/script-library` in the service worker.

- [ ] **Step 6: Run domain tests and extension typecheck**

Run:

```bash
npm --prefix apps/browser-extension test
npm --prefix apps/browser-extension run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the matcher slice**

```bash
git add apps/browser-extension/src/domain/scriptLibrary.ts apps/browser-extension/src/domain/scriptLibrary.test.ts apps/browser-extension/src/shared/contracts.ts apps/browser-extension/src/background/serviceWorker.ts apps/browser-extension/package.json
git commit -m "feat: add browser script matching domain"
```

---

### Task 4: Feige Order-Status and Safe Reply-Field Contract

**Files:**
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.ts`
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`
- Modify: `apps/browser-extension/src/content/contentScript.ts`
- Modify: `apps/browser-extension/src/shared/contracts.ts`

**Interfaces:**
- Consumes: real Feige DOM and `FILL_FEIGE_REPLY_IF_EMPTY` page command.
- Produces: `FeigePageContext.orderStatus` and `{ ok: true, filled: boolean, reason?: 'NOT_EMPTY' }`.

- [ ] **Step 1: Add a failing no-order context test**

```ts
assert.equal(realContext.orderStatus, '');
assert.ok(realContext.diagnostics.includes('未识别订单状态'));
```

- [ ] **Step 2: Add a failing non-overwrite test**

```ts
reply.value = '客服正在输入';
assert.deepEqual(adapter.fillReplyIfEmpty('系统推荐'), { ok: true, filled: false, reason: 'NOT_EMPTY' });
assert.equal(reply.value, '客服正在输入');
```

- [ ] **Step 3: Implement the context field and safe fill method**

Add `orderStatus: string` to every context result. Until a real order card is inspected, only support `[data-jx-order-status]` and `[data-testid="order-status"]`; do not add class-name guesses. Route the new command through `contentScript.ts`.

- [ ] **Step 4: Run adapter tests and extension typecheck**

Run:

```bash
npx tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts
npm --prefix apps/browser-extension run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the safe page contract**

```bash
git add apps/browser-extension/src/content/douyinFeigeAdapter.ts apps/browser-extension/src/content/douyinFeigeAdapter.test.ts apps/browser-extension/src/content/contentScript.ts apps/browser-extension/src/shared/contracts.ts
git commit -m "feat: add safe Feige reply recommendation contract"
```

---

### Task 5: Grouped Script Browser and Administrator Editor

**Files:**
- Create: `apps/browser-extension/src/sidepanel/ScriptLibrarySection.tsx`
- Create: `apps/browser-extension/src/sidepanel/ScriptLibraryEditor.tsx`
- Modify: `apps/browser-extension/src/sidepanel/main.tsx`
- Modify: `apps/browser-extension/public/sidepanel.css`

**Interfaces:**
- Consumes: `ScriptLibraryView`, `ScriptMatch`, `onFill(content)`, and `onSave(library)`.
- Produces: grouped manual browsing, admin-only editing, and an immutable draft passed to the save callback.

- [ ] **Step 1: Implement a testable editor model before JSX**

Create exported pure helpers in `ScriptLibraryEditor.tsx`:

```ts
addGroup(library, id): ScriptLibrary
removeGroup(library, groupId): ScriptLibrary
addScript(library, groupId, id): ScriptLibrary
updateScript(library, groupId, scriptId, patch): ScriptLibrary
```

Add `ScriptLibraryEditor.test.ts` asserting immutable add, edit, and cascading group removal, then add the test to the package test script.

- [ ] **Step 2: Run the editor-model test and confirm failure before implementation**

Run: `npx tsx apps/browser-extension/src/sidepanel/ScriptLibraryEditor.test.ts`

Expected: FAIL until helpers are implemented.

- [ ] **Step 3: Build grouped browsing**

Render enabled groups ordered by `sortOrder`, group tabs, enabled script cards, and a `系统推荐` chip on the matched card. Manual card click calls `onFill` and never sends.

- [ ] **Step 4: Build administrator editing**

When `canManage` is true, render “管理话术”. The editor supports group name/enabled/sort and script title/content/enabled/sort/priority/order statuses/product keywords/contact state. Use comma/newline parsing for list conditions and preserve the server-provided revision.

- [ ] **Step 5: Integrate load/save in `main.tsx`**

On authenticated startup call `GET_SCRIPT_LIBRARY`. Save with `SAVE_SCRIPT_LIBRARY`, replace local state with the returned server version, and surface 403/409/validation messages in the existing alert area.

- [ ] **Step 6: Run editor tests, typecheck, and build**

Run:

```bash
npm --prefix apps/browser-extension test
npm --prefix apps/browser-extension run typecheck
npm --prefix apps/browser-extension run build
```

Expected: PASS and `dist/manifest.json` exists.

- [ ] **Step 7: Commit the grouped editor slice**

```bash
git add apps/browser-extension/src/sidepanel apps/browser-extension/src/sidepanel/main.tsx apps/browser-extension/public/sidepanel.css apps/browser-extension/package.json
git commit -m "feat: add grouped browser script editor"
```

---

### Task 6: Recommendation Integration Without Human-Input Overwrite

**Files:**
- Modify: `apps/browser-extension/src/sidepanel/main.tsx`
- Modify: `apps/browser-extension/src/sidepanel/ScriptLibrarySection.tsx`
- Modify: `apps/browser-extension/src/shared/contracts.ts`
- Test: `apps/browser-extension/src/domain/scriptLibrary.test.ts`

**Interfaces:**
- Consumes: `matchScript`, refreshed `FeigePageContext`, detected contact, and `FILL_FEIGE_REPLY_IF_EMPTY`.
- Produces: visible recommendation state and at-most-once safe auto-fill per `orderNo + scriptId` in one side-panel session.

- [ ] **Step 1: Add a failing recommendation-decision test**

Export and test:

```ts
recommendationKey('DY-1', 'script-1') === 'DY-1:script-1'
shouldAttemptAutoFill({ orderNo: 'DY-1', orderStatus: '已付款', key, attemptedKeys }) === true
```

The decision returns false for blank order/status and a previously attempted key.

- [ ] **Step 2: Implement recommendation state in `main.tsx`**

After a successful context refresh and a server-confirmed library load:

1. call `matchScript`;
2. display the match and reasons;
3. if its key has not been attempted, send `FILL_FEIGE_REPLY_IF_EMPTY`;
4. mark the key attempted regardless of empty/non-empty result so refresh cannot repeatedly write;
5. show either “已自动填入，请确认发送” or “输入框已有内容，仅提供推荐”.

- [ ] **Step 3: Run matcher tests, all extension tests, typecheck, and build**

Run:

```bash
npm --prefix apps/browser-extension test
npm --prefix apps/browser-extension run typecheck
npm --prefix apps/browser-extension run build
```

Expected: PASS.

- [ ] **Step 4: Commit recommendation integration**

```bash
git add apps/browser-extension/src/sidepanel/main.tsx apps/browser-extension/src/sidepanel/ScriptLibrarySection.tsx apps/browser-extension/src/shared/contracts.ts apps/browser-extension/src/domain/scriptLibrary.test.ts
git commit -m "feat: safely recommend browser scripts"
```

---

### Task 7: Documentation, Full Verification, and Real-Page Gate

**Files:**
- Modify: `docs/ai-browser-employee-mvp.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: install/use instructions and a verified branch ready for real-order DOM calibration.

- [ ] **Step 1: Update operating documentation**

Document group management, administrator permissions, manual fill, recommendation reasons, the non-overwrite guarantee, and the requirement to inspect a real order before enabling order-status matching.

- [ ] **Step 2: Run schema, root, and extension verification**

Run:

```bash
DATABASE_URL='mysql://user:pass@localhost:3306/jixiang' npx prisma validate
npm run build
npm test
npm run browser-employee:test
npm run browser-employee:typecheck
npm run browser-employee:build
git diff --check
```

Expected: Prisma valid, root production build passes, every root and extension test passes, extension bundles successfully, and diff check is clean.

- [ ] **Step 3: Review changes against the fixed base**

Run the repository review workflow against `main`, fix every actionable correctness or safety finding, and repeat affected tests.

- [ ] **Step 4: Commit documentation and any review fixes**

```bash
git add docs/ai-browser-employee-mvp.md
git commit -m "docs: explain unified browser script workflow"
```

- [ ] **Step 5: Reload extension and verify the current no-order conversation**

Expected current behavior:

- customer, product, and messages recognized;
- grouped scripts load from 极享OS;
- administrator can edit and save;
- order status remains unrecognized for a no-order customer;
- no automatic fill occurs without recognized order number and status.

- [ ] **Step 6: Inspect one real ordered conversation before activating status matching**

Read the real order card DOM, add only stable selectors to `douyinFeigeAdapter.ts`, add its minimized HTML structure to the adapter test, rebuild, reload, and verify that an empty reply box is filled while an existing human reply is untouched.
