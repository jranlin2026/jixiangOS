# Browser employee final-review fix report

Date: 2026-08-08

## Outcome

The final-review Important findings are fixed in one focused wave:

1. Duplicate `ALREADY_CREATED` intake now returns the normalized nickname/phone/WeChat snapshot read from the linked `LeadRecord`. The extension compares the submitted nickname and the exact contact chosen for the Feige remark (phone first, otherwise WeChat) with that snapshot. Missing or divergent data fails closed with an explicit reconciliation message and performs no Feige page action.
2. Page recognition and mutation now resolve exactly one visible active order card. Order number and order status come from that same card. Completion binds to the original DOM card object and revalidates the same card, paid status, order number, and customer before edit, green-flag, and save clicks and again during final verification. Stale document values, collapsed cards, mixed selector matches, multiple visible cards, and same-content replacement cards fail closed.
3. The report-only retry minor is also fixed: if page remark and green flag already succeeded, retry only reports the result to OS and does not repeat page clicks.

No live Feige write, production data write, or real database migration was performed.

## Duplicate-contact reconciliation

### Server contract

- `BrowserLeadIntakeResult.storedContact` contains normalized `nickname`, optional `phone`, and optional `wechat`.
- A newly created lead returns a snapshot from the actual `createLead` response.
- A duplicate reservation reads its snapshot from the linked `LeadRecord`:
  - first by `externalIntakeKey`;
  - then, for legacy sync records, by stored `leadId`.
- If a succeeded duplicate cannot yield a complete linked-lead snapshot, intake returns HTTP/API 409 with: `已入库线索的客户资料无法完整读取，请先在极享OS核对后重试`.
- No new schema column or migration was added.

### Workflow guard

For `ALREADY_CREATED` only, the workflow requires:

- submitted nickname equals stored nickname after boundary trimming; and
- if a phone is submitted and therefore selected for the remark, it exactly equals stored phone; otherwise submitted WeChat exactly equals stored WeChat.

Any mismatch reports a failed/not-attempted platform result, displays a reconciliation instruction, and returns before `completePage`.

## Active-order binding

- `readContext()` no longer reads document-wide order number or status.
- Visible order-card candidates are collected across semantic selectors and nested matches are collapsed to their outer card; zero or more than one outer card is not accepted.
- `completeOsOrder()` requires one visible card, a readable order number and status from that card, the expected order/customer, and a paid-valid status before opening the remark UI.
- The adapter retains the selected card object and rejects removal, replacement, hiding, ambiguity, order/status mutation, or customer switch at every action boundary.
- The existing semantic green-control, save-control, dialog-closure, exact remark-summary, and active-green verification remain in force.

## TDD evidence

### RED

The tests were added before the corresponding production changes and failed for the intended missing behavior:

```text
npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts
AssertionError: duplicate storedContact actual undefined

npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts
AssertionError: linked-lead storedContact actual undefined

npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts
AssertionError: phone mismatch page calls 1 !== 0

npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts
AssertionError: expected ACTIVE-ORDER, actual STALE-ORDER

npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/content/douyinFeigeAdapter.test.ts
AssertionError: mixed-selector ambiguous card edit clicks 1 !== 0

npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts
AssertionError: report-only retry stage PLATFORM_FAILED !== COMPLETED
```

### GREEN

Focused tests after implementation:

```text
browser lead intake idempotency: ok
browser lead sync repository reservation: ok
order completion workflow: ok
douyin feige page adapter: ok
```

Coverage includes:

- duplicate snapshot preserves stored OS data even when submitted nickname, phone, and WeChat diverge;
- linked-lead recovery by `externalIntakeKey` and legacy `leadId`;
- matching and mismatching phone flows;
- matching and mismatching WeChat flows;
- nickname mismatch fails closed;
- stale document values, hidden/collapsed cards, same-selector ambiguity, mixed-selector ambiguity, and same-content card replacement;
- zero edit/green/save clicks in unsafe order-card fixtures;
- report-only retry makes zero page calls.

## Script-library GET permission ruling

Ruling: preserve authenticated GET; do not revert it to lead-create authorization.

Evidence:

- The current script-library design explicitly states `客服可读不可写，系统管理员可读可写` in its permission acceptance criteria.
- The older implementation plan says both routes use `requireLeadCreate`; that line is stale relative to the current design and the user-approved correction after customer-service users received Forbidden.
- Current GET uses `requireAuthenticated`, and the route regression proves an authenticated customer-service user without lead-create permission receives 200.
- PUT is not exposed for customer-service writes: it is authenticated at the route and `scriptLibraryService.update()` independently requires super-admin, returning 403 otherwise. Service tests prove customer-service cannot update and admin can.
- Lead intake and platform-completion routes still use `requireLeadCreate`; broad write authorization was not weakened.

Therefore authenticated GET is the intended least privilege for operational script consumption, while actual library mutation remains super-admin-only.

## Verification

Fresh verification completed successfully:

```text
npm exec -- tsx server/services/browserAgent/browserLeadIntakeService.test.ts
npm exec -- tsx server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts
npm exec -- tsx server/routes/browserAgentRoutes.test.ts
npm exec -- tsx server/services/browserAgent/scriptLibraryService.test.ts
npm --prefix apps/browser-extension test
npm --prefix apps/browser-extension run typecheck
npm --prefix apps/browser-extension run build
test -f apps/browser-extension/dist/manifest.json
npx tsc -b --pretty false
npm run build
git diff --check
```

All commands exited 0. The root Vite build emitted its existing large-chunk advisory; the route test emitted Node's localStorage experimental warning. Neither is a test or build failure.

## Deferred minors and concerns

- Component-mounted `main.tsx` second-click integration coverage remains deferred. Reducer/workflow coverage exists, but adding a new mounted React harness would broaden this final safety wave.
- Legacy internal `FILL_FEIGE_REPLY` / `SAVE_ORDER_REMARK` commands remain available and were not broadened into this order-completion fix. The combined guarded completion path does not use the legacy remark command.
- Real paid-order order-status, green-control semantics, and post-save signals still require supervised read-only/write calibration. Unknown status now fails before any page click.
- `tmp/` was pre-existing/untracked and was not touched.
