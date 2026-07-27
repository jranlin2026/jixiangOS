# Task 3 report — customer read/manage policy and authoritative single-record commands

## Outcome

Implemented one server-authoritative customer access boundary that separates reading from managing. Customer reads now allow the configured owner range, contributor compatibility, and public-pool visibility without turning any of those read paths into write authority. Customer writes require a resolved stable `ownerId`, a manageable owner range derived from the fresh server directory, and the exact action/field permission leaf.

All current single-customer writes, customer todo writes, and discovered derived customer writers now use a `BusinessRecord` repository with row locking and compare-and-save conflict detection. No Prisma `Customer` model was introduced.

## Main implementation

- Added `customerAccessPolicy.ts`:
  - builds `CustomerAccessContext` from active users, roles, and departments queried on the server;
  - requires the actor's stable `roleId` and fails closed for an inactive/missing role, invalid customer scope, missing department identity, deleted customer, unresolved owner identity, or missing `ownerId`;
  - implements `self`, `department_only`, `department_and_descendants`, and `all` manage ranges;
  - keeps legacy owner/contributor names read-only and never uses them for manageability;
  - separates `canReadCustomer` from `canManageCustomer`;
  - maps field groups and commands to explicit leaves, including explicit `CUSTOMER_DELETE/delete` and the dedicated public-pool claim leaf.
- Added `customerBusinessRecordRepository.ts`:
  - validates `aaos_customers` rows and `recordId === customer.id`;
  - supports ordinary reads and `SELECT ... FOR UPDATE`;
  - saves only with the locked row's top-level `BusinessRecord.updatedAt` and raises `CustomerWriteConflictError` when the compare-and-save count is not exactly one.
- Updated customer list/detail/follow-up, command, todo, tag, tag migration, owner-identity backfill, order application, order approval effects, and order command flows to share the access policy and repository boundary.
- Replaced live customer `CUSTOMER_EDIT` / `CUSTOMER_ASSIGN` route gates with exact profile/progress/tag/attribution/todo/transfer/release/claim/delete leaves.
- Preserved the narrow todo exception: an assignee may complete their own todo only when they can read its customer; creating, editing, reopening, cancelling, or completing someone else's todo requires todo permission plus manageability.
- Defined public-pool state canonically as public-pool lifecycle plus public-pool owner identity plus no stable owner ID. The display text `owner === '公海'` is not a runtime customer authorization signal.
- Disabled legacy whole-array customer storage reads, writes, and runtime access. The key stays registered so callers fail explicitly.
- Removed customer JSON rewrites from employee leave/handoff. An employee who still owns customers is now blocked until customer transfer/release is completed through customer commands; the later batch task supplies that bulk workflow.
- Updated customer UI gates and the local mock's locked-contact override to use explicit leaves. A role display name alone no longer grants the override.
- Customer browser visibility now treats a passed user without trusted department identity as self-only instead of hydrating authority from `localStorage`; explicitly supplied directory data retains the new customer scopes, while every non-customer legacy `department` scope retains descendant behavior.

## Review hardening

- Protected `aaos_customers` from every raw maintenance path, not only runtime storage: raw list omits it, single-key get/remove return 403, and prefix clear preserves it while continuing to clear unrelated storage/lead/business domains.
- Retired the old per-CRM customer import endpoint. `POST /api/crm-migration/import` now always returns HTTP 410 and directs callers to the unified customer import template; no live route invokes `storageService.importCrmMigration`.
- Added one shared `CustomerWriteConflictError` mapper and applied it to customer commands, follow-ups, all todo mutations, tag merge, owner identity backfill, and order-approval customer projection. Existing tag migration and order command projection behavior remains HTTP 409. A real Express route test proves follow-up conflicts stay HTTP 409 instead of being collapsed to 400.
- Made Customer Detail profile saves permission-aware deltas. A profile-only rename submits only `name`; unchanged, attribution, and locked-contact fields are not smuggled into the request. Attribution controls remain visibly read-only without the explicit attribution leaf.
- Made attribution editing independently reachable: a role with only the explicit attribution leaf can open the editor for a manageable customer, sees profile fields read-only, and submits only changed attribution fields. A profile-only role cannot alter attribution fields.
- Made follow-up controls require explicit profile-edit permission plus stable-ID manageability. Todo create/edit/cancel/reopen require explicit todo permission plus manageability, while the readable assignee's own pending todo completion remains available.
- Added one shared client write-action policy for profile/attribution edits, tags, follow-ups, todos, progress, transfer, release, and delete. Customer Detail and Customer List now require both the exact explicit leaf and stable-owner manageability; contributor-only and public-pool read paths expose none of those ordinary writes. List open/confirm handlers and already-open dialog buttons re-check the same policy. Public-pool claim remains the deliberate separate exception.
- Added the dedicated `GET /api/customers/manageable-users` bootstrap path. It accepts every customer manage leaf with the authoritative action (`delete` for customer delete, `write` for the others), rebuilds customer access from the fresh server directory, and returns only the minimal `id`, `name`, and optional `positionName` DTO. It never exposes email, phone, role, or the shared assignable-user payload.
- Restored the shared `/api/settings/assignable-users` and `/api/settings/assignable-directory` permissions and cross-module semantics. Delivery, leads, after-sales, finance, and existing customer-todo/transfer consumers still receive every active employee candidate; customer scope no longer filters these shared APIs.
- Customer Detail and Customer List now consume only the dedicated customer directory. Transfer options and the submit-time allowlist are exactly the server response; stale browser users cannot expand it. The authenticated user's stable ID remains a manageability fallback only, so profile-only self management does not disappear while the directory is loading, but it does not create a transfer candidate.
- Removed customer list/count reliance on stale `BusinessRecord.owner` and `title` mirrors. Visibility, owner filters, and search use the authoritative customer JSON, so mismatched mirrors cannot produce short pages or incorrect totals. Pagination remains one `COUNT` plus one `LIMIT/OFFSET` query; the core stable-owner visibility path already used JSON before this correction.

## Changed areas

- Access/repository: `customerAccessPolicy*`, `customerBusinessRecordRepository*`
- Customer commands and reads: `customerCommandService*`, `customerListService*`, `customerTodoService*`, `server/index.ts`
- Derived customer writes: owner identity, customer tags/migration, order application/approval/command services and tests
- Safety boundaries: `legacyStorageAccess*`, `storageRoutesAuth.test.ts`, `settingsService*`
- Client compatibility/UI: `customerApi*`, customer list/detail pages, `dataVisibility.ts`, assignment/data-visibility/UI static regressions

## TDD evidence

The focused suites were written or extended around the missing policy/repository behavior before the implementation. RED coverage included:

- contributor/public-pool reads being coupled to management;
- unresolved owners and customer department scopes lacking a fail-closed policy;
- public-pool claim using generic manageability;
- missing `BusinessRecord` row locking/version comparison;
- mixed-field updates and todo mutations reaching writes without all required leaves;
- derived order/tag/backfill paths writing customer JSON outside the repository;
- role display names and legacy storage paths retaining customer authority.
- raw maintenance list/get/remove/prefix-clear exposing or deleting the protected customer asset;
- the legacy CRM import route remaining a live customer write bypass;
- compare-and-save conflicts escaping or being converted to an incorrect HTTP status;
- profile-only UI saves carrying attribution fields, missing action/manage gates, and the own-todo completion exception disappearing;
- customer UI sourcing transfer candidates from shared settings, lead-flow configuration, or stale browser users instead of a dedicated server upper bound;
- profile-only self access being rejected by the dedicated directory route, department candidates being returned outside fresh customer scope, and the endpoint leaking the shared user payload;
- customer-only scope/permission changes contaminating shared delivery, leads, and after-sales assignment directories;
- attribution-only editors being unable to open while profile-only editors could smuggle attribution changes;
- customer-list delete/transfer/release controls and their handlers relying on a permission leaf without stable-ID manageability;
- contributor/public-pool readable customers exposing ordinary write controls when the user held the corresponding leaf;
- top-level owner/title mirrors disagreeing with customer JSON and corrupting visible items or pagination totals.

Final focused verification passed for:

```text
server/services/customerAccessContext.test.ts
server/services/customerAccessPolicy.test.ts
server/services/customerBusinessRecordRepository.test.ts
server/services/customerCommandService.test.ts
server/services/customerListAccessPolicy.test.ts
server/services/customerListService.test.ts
server/services/customerOwnerIdentityService.test.ts
server/services/customerTagMigrationService.test.ts
server/services/customerTagService.test.ts
server/services/customerTodoAccessPolicy.test.ts
server/services/customerTodoService.test.ts
server/services/legacyStorageAccess.test.ts
server/services/orderApplicationService.test.ts
server/services/orderApprovalEffectsService.test.ts
server/services/orderCommandService.test.ts
server/middleware/auth.test.ts
server/routes/customerManageableUsersRoutes.test.ts
server/services/customerManageableUsersService.test.ts
server/services/settingsAssignableUsers.test.ts
server/services/settingsService.test.ts
server/services/storageService.test.ts
server/storageRoutesAuth.test.ts
server/routes/crmMigrationRoutes.test.ts
server/routes/customerFollowUpRoutes.test.ts
src/api/customerApi.test.ts
src/api/customerManageableUsers.test.ts
src/api/customerLeadProfileSecurityStatic.test.ts
src/api/customerTodoFeatureStatic.test.ts
src/api/customerWriteManageabilityStatic.test.ts
src/api/leadAssignmentCandidates.test.ts
src/api/uiPolishStatic.test.ts
src/pages/Customers/customerDetailPolicy.test.ts
src/shared/utils/dataVisibilityScope.test.ts
```

## Full verification

Using the bundled Node runtime:

```sh
pnpm test
# 196 test files passed.

pnpm build
# tsc -b && vite build; 13,400 modules transformed.

git diff --check
# exit 0
```

Two full-suite compatibility findings were corrected before the final green run:

1. The local customer API test still expected the display role name `超级管理员` to override locked contact fields. It now proves the display name is inert and a stable role ID with explicit `CUSTOMER_DELETE/delete` is required.
2. A customer assignment-candidate regression expected a passed user missing `departmentId` to recover authority from browser storage. It now proves that customer scope fails closed to self; explicit department identity/directory tests cover `department_only` and descendants. The non-customer leads scope remains unchanged.

The review pass also caught a TypeScript generic mismatch in the shared conflict result and the extracted follow-up route handler. Their nullable API result types were corrected before the successful build.

## Live authorization audit

- No live customer route or customer service authorization uses `CUSTOMER_EDIT` or `CUSTOMER_ASSIGN`.
- Remaining old-key references are compatibility definitions/default seed data or the one-time signed role migration; they are not runtime customer command gates.
- Remaining customer owner-name checks are limited to read/display compatibility and owner-identity migration. Manage/write authorization uses stable owner IDs only.
- Remaining `super_admin` checks in `customerCommandService.ts` govern lead editing/deletion, not customer authorization.
- All discovered server-side customer JSON mutation paths use the repository lock/compare-and-save boundary.
- All discovered `CustomerWriteConflictError` paths return a 409 API result, and live HTTP routes preserve that status.

## Follow-up boundary

Task 3 intentionally blocks employee deactivation/handoff while customers remain assigned. Task 6 must provide the supported batch transfer/release prerequisite; this task does not recreate the unsafe legacy name-based partial handoff.

No push or deployment was performed.
