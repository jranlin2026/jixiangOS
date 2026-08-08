# Browser Completion Final Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every behavior change follows RED-GREEN-REFACTOR.

**Goal:** 修复最终复核剩余的联系方式规范化、嵌套订单卡片歧义和仅上报重试问题，使半自动飞鸽闭环达到可交付代码标准。

**Architecture:** 复用极享OS现有手机号比较函数作为唯一规范；订单页面只接受唯一可见的最内层活动订单卡；已知平台动作成功的重试直接上报，不再依赖当前飞鸽页面。

**Tech Stack:** TypeScript、Chrome Extension MV3、JSDOM、Node assert

## Global Constraints

- 所有修复必须先增加能够稳定复现最终复核问题的失败测试。
- 联系方式比较必须与极享OS存储规范一致：大陆手机号 `138...` 与 `+86138...` 等价，微信号忽略大小写。
- 联系方式不一致继续安全停止，不得操作飞鸽页面。
- 订单号、订单状态和修改入口必须来自同一个唯一可见的活动订单卡；嵌套包装不能隐藏多个真实订单。
- 平台备注和绿旗已经成功时，仅上报重试不得读取或操作当前飞鸽页面。
- 真实绿色旗帜语义和保存成功信号未校准前继续 fail closed。
- 不修改话术库 GET 的已认证客服可读权限；PUT 继续仅管理员可写。
- 不执行真实订单写入，不执行真实数据库迁移。

---

### Task 1: 按极享OS规范比对重复订单联系方式

**Files:**
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts`

**Interfaces:**
- Consume: `normalizePhoneForComparison(value)` from `src/shared/utils/phoneNumber.ts`.
- Produce: duplicate reconciliation that treats phone formatting and WeChat casing consistently with OS storage.

- [ ] Add failing workflow tests where submitted `13826459812` matches stored `+8613826459812`, and submitted `Wx_User88` matches stored `wx_user88`.
- [ ] Run `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts` and verify both new cases fail at duplicate reconciliation.
- [ ] Import and use `normalizePhoneForComparison` for both submitted and stored phone values; compare trimmed WeChat values with `.toLowerCase()`.
- [ ] Keep nickname comparison trimmed and exact. Keep mismatch behavior fail closed and assert `completePage` is not called for a genuinely different phone or WeChat.
- [ ] Run the focused workflow test, full extension tests, extension typecheck and build.
- [ ] Commit with `fix(browser-extension): normalize duplicate contact reconciliation`.

---

### Task 2: 拒绝嵌套包装隐藏的多订单歧义

**Files:**
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.ts`
- Modify: `apps/browser-extension/src/content/douyinFeigeAdapter.test.ts`

**Interfaces:**
- Consume: existing `uniqueMatches`, `isVisible`, `orderNoFromElement`, and guarded `completeOsOrder` flow.
- Produce: `visibleActiveOrderCards()` returning visible leaf order-card candidates, so a wrapper containing two real cards yields two candidates and fails uniqueness.

- [ ] Add a failing JSDOM fixture with one broad matching wrapper that contains two visible matching child order cards, each with its own 19-digit order number/status/edit button. Assert context reports ambiguous/no order and `completeOsOrder` never clicks either edit control.
- [ ] Run `npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts` and verify the wrapper is incorrectly treated as one card before the fix.
- [ ] Change nested candidate reduction to keep visible leaf candidates: remove a candidate when it contains another visible candidate, rather than removing the contained candidate.
- [ ] Preserve existing single nested-card behavior, sibling ambiguity behavior, collapsed/hidden-card behavior, and semantic role-based live fixture.
- [ ] Run focused adapter test, full extension tests, extension typecheck and build.
- [ ] Commit with `fix(browser-extension): reject nested order card ambiguity`.

---

### Task 3: 仅上报重试脱离当前飞鸽页面

**Files:**
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts`
- Modify: `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts`

**Interfaces:**
- Consume: `existingIntake.orderRemarkStatus`, `existingIntake.greenFlagStatus`, stored-contact reconciliation, and `reportCompletion`.
- Produce: report-only retry that performs no `readContext`, `intake`, or `completePage` call.

- [ ] Add a failing workflow test with an existing intake whose remark and green statuses are `SUCCEEDED`, while `readContext`, `intake`, and `completePage` all throw. Assert exactly one report call and final `COMPLETED` state.
- [ ] Run the focused workflow test and verify it currently fails by calling `readContext`.
- [ ] After validating the stored-contact snapshot against the submitted nickname/contact, move the report-only branch before live page-context reading. A stored-contact mismatch must still fail closed without reporting success.
- [ ] Preserve monotonic status reporting and error handling when the report API itself fails.
- [ ] Run focused workflow test, full extension tests, typecheck and build.
- [ ] Commit with `fix(browser-extension): decouple completion report retry`.

---

### Task 4: 最终验证与分支卫生

**Files:**
- Modify only if required by verification: `docs/ai-browser-employee-mvp.md`

- [ ] Run extension tests, extension typecheck, extension build, focused browser-agent service/repository/route tests, root TypeScript build, root Vite build, manifest existence check and `git diff --check`.
- [ ] Confirm no source or test uses numeric/positional green-flag selection.
- [ ] Confirm authenticated script-library GET and admin-only PUT behavior remain unchanged.
- [ ] Confirm only intentional source/docs files are tracked; leave the PDF scratch `tmp/` untracked and untouched.
- [ ] Commit documentation only if verification changes operational instructions.
