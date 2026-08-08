# Task 1: 按极享OS规范比对重复订单联系方式

## Result

Duplicate-order reconciliation now uses the OS canonical phone comparison and case-insensitive, trimmed WeChat comparison. Nickname matching remains trimmed and exact. Empty or missing stored values remain mismatches, so reconciliation fails closed.

## TDD evidence

### RED

Command:

```sh
npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts
```

Output before the production change:

```text
AssertionError [ERR_ASSERTION]: 手机号按极享OS存储格式归一化后应继续完成订单
+ actual - expected

+ 'PLATFORM_FAILED'
- 'COMPLETED'
```

The new test fixtures cover both required OS snapshots: submitted `13826459812` versus stored `+8613826459812`, and submitted `Wx_User88` versus stored `wx_user88`. The prior exact comparison rejected these representations at duplicate reconciliation.

### GREEN

Focused workflow test:

```sh
npm exec --prefix apps/browser-extension -- tsx apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts
# order completion workflow: ok
```

Full extension verification:

```sh
cd apps/browser-extension && npm test
# 10 extension test commands passed, including order completion workflow

cd apps/browser-extension && npm run typecheck
# tsc --noEmit exited 0

cd apps/browser-extension && npm run build
# background/content/sidepanel bundles built successfully
```

`git diff --check` also exited 0.

## Changed files

- `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.ts`
  - imports `normalizePhoneForComparison` from the OS shared phone utility;
  - compares non-empty submitted and stored phone identities through that canonical function;
  - compares non-empty trimmed WeChat IDs after lowercasing both values.
- `apps/browser-extension/src/sidepanel/orderCompletionWorkflow.test.ts`
  - adds realistic `ALREADY_CREATED` contact snapshots for normalized phone and case-insensitive WeChat matching, each asserting the order completes and invokes the page completion once.

## Safety review and concerns

- Existing mismatch tests still assert that genuinely different phone, WeChat, or nickname stops at `PLATFORM_FAILED` with zero `completePage` calls.
- No behavior outside duplicate-contact reconciliation was changed.
- The browser extension deliberately imports the existing OS canonical normalizer as required; its typecheck and bundle both succeed.
