# Manual Script Append Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer-service agent manually append a selected script to the existing Feige reply while preserving safe non-overwrite behavior for automatic recommendations.

**Architecture:** Add one explicit append command to the existing side-panel/content-script contract. Keep string composition and DOM writes in the Feige adapter so textarea and contenteditable editors share the same behavior and context guard.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3, React 18, JSDOM, Node assert, esbuild.

## Global Constraints

- Manual click appends with exactly one newline when content already exists.
- An editor already ending in a newline receives no extra blank line.
- Automatic recommendation continues to fill only an empty editor.
- No path clicks the Feige send button.
- Existing order/customer context checks remain mandatory before writes.

---

### Task 1: Page Adapter Append Contract

**Files:**
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.ts`

**Interfaces:**
- Consumes: the current reply editor, `setEditableValue()`, and expected customer/order context.
- Produces: `appendReply(value, expected): PageWriteResult`.

- [ ] **Step 1: Write failing adapter tests**

Add assertions equivalent to:

```ts
reply.value = '已有内容';
assert.deepEqual(adapter.appendReply('新话术'), { ok: true });
assert.equal(reply.value, '已有内容\n新话术');

reply.value = '已有内容\n';
adapter.appendReply('新话术');
assert.equal(reply.value, '已有内容\n新话术');
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npx tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`

Expected: FAIL because `appendReply` does not exist.

- [ ] **Step 3: Implement minimal append behavior**

Read the editor value, choose `value` for an empty editor or `${current}${current.endsWith('\n') ? '' : '\n'}${value}` for a non-empty editor, then call `setEditableValue()`. Reuse the same expected-order and expected-customer guard as safe fill.

- [ ] **Step 4: Run focused test**

Run: `npx tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`

Expected: PASS.

### Task 2: Command Wiring and Side-Panel Behavior

**Files:**
- Modify: `apps/browser-extension/src/shared/contracts.ts`
- Modify: `apps/browser-extension/src/content/contentScript.ts`
- Modify: `apps/browser-extension/src/sidepanel/main.tsx`

**Interfaces:**
- Consumes: `appendReply()` from Task 1.
- Produces: `APPEND_FEIGE_REPLY` page command used only by manual script-card clicks.

- [ ] **Step 1: Add `APPEND_FEIGE_REPLY` to `PageCommand`**

The command carries `text`, `expectedOrderNo`, and `expectedCustomerDisplayName`.

- [ ] **Step 2: Route the command through the content script**

Call `adapter.appendReply()` and return its `PageWriteResult`.

- [ ] **Step 3: Change only manual card filling**

Change `fillScript()` in `main.tsx` to send `APPEND_FEIGE_REPLY` and show `话术已追加到飞鸽，请客服确认后发送`. Leave the automatic recommendation effect on `FILL_FEIGE_REPLY_IF_EMPTY`.

- [ ] **Step 4: Verify the complete extension**

Run:

```bash
npm --prefix apps/browser-extension test
npm --prefix apps/browser-extension run typecheck
npm --prefix apps/browser-extension run build
git diff --check
```

Expected: all commands exit 0 and `apps/browser-extension/dist/manifest.json` exists.

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src
git commit -m "feat: append manually selected browser scripts"
```
