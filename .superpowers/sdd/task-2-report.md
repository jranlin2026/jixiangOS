# Task 2 report — versioned customer permission and scope migration

## Outcome

Implemented the versioned, one-time customer permission/scope migration required by Task 2. The migration is serializable, idempotent after its marker is written, validates an immutable checksummed and HMAC-signed manifest before making changes, and never derives delete access from a role name or role code at runtime.

The release path now fails closed when the signing key, prerequisite role baseline, manifest signature/checksum, role-data hash, captured role IDs, marker, compare-and-swap update, or final full-role-set verification is invalid.

## Changed files

- `server/services/roleMigrationService.ts`
  - Added `CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION = 1` and marker key `aaos_customer_permission_scope_baseline_version`.
  - Added canonical raw-role hashing, HMAC-SHA256 signing/verification, and strict manifest/marker validation.
  - Added a serializable, idempotent legacy permission and customer-scope migration.
  - Added row CAS plus a pre-marker full-set canonical hash/ID/`updatedAt` verification.
  - Added fixed, redacted migration error codes.
- `server/services/roleMigrationService.test.ts`
  - Added migration, manifest, rollback, idempotency, cache-hydration, CLI, and compatibility-capture regressions.
- `scripts/prepare-customer-permission-migration.ts`
  - Added `capture --out <path>` and `apply-manifest --file <path>` workflows.
  - Requires `CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY`, writes capture files atomically with owner-only permissions, and rejects mutable or stale evidence.
  - Runs the frozen legacy name/code adapter only during capture; apply verifies signed evidence without re-running it.
- `server/index.ts`
  - Runs the existing role baseline and the new customer baseline before serving HTTP traffic.
  - Logs only migration version/count or a fixed redacted failure code.
  - Delegates runtime role hydration to the behavior-tested runtime storage handler.
- `server/routes/runtimeStorageRoutes.ts` and `.test.ts`
  - Hydrate roles from authoritative Prisma rows and return either the full authorized set or only the resolved immutable current role.
  - Exercise the production handler over HTTP with the real auth middleware/service chain.
- `src/shared/utils/permissions.ts`
  - Makes `CUSTOMER_DELETE` explicit-module-only even for `全部/admin`, `全部/delete`, and `super_admin` code paths.
  - Resolves a legacy `roleId=null` account to one unambiguous active role at the authentication boundary and persists its immutable ID in the authenticated user.
- `src/shared/utils/organizationConfig.ts`
  - Removed name/code-based super-administrator matching from runtime default-access merging.
  - Preserves database explicit permissions when merging the immutable default administrator seed.
  - Added an isolated compatibility-only capture adapter that requires both the old authorization entry and the old command path's unrestricted customer scope.
- `.env.example`
  - Documents the required server-only HMAC key.
- `.gitignore`
  - Ignores the default private manifest output directory.

## Migration behavior

- Legacy `CUSTOMERS/read` grants customer list/detail only.
- Legacy `CUSTOMER_ASSIGN` grants transfer and release-to-pool.
- Legacy `CUSTOMER_EDIT` with an effective write-class action grants profile, tags, todos, and attribution only; it never grants progress editing.
- Legacy `CUSTOMER_EDIT/read` does not manufacture write access.
- `CUSTOMER_DELETE` is granted only to immutable role IDs in the verified manifest. Every customer-delete module is removed from roles not named by that manifest, including whitespace variants.
- Customer deletion requires an explicit `CUSTOMER_DELETE` module at runtime; wildcard, parent, legacy, or role-code grants cannot recreate it.
- Customer scope `department` migrates to `department_and_descendants`; unrelated domain scopes are preserved.
- A completed marker makes later starts a zero-change no-op, preserving administrator edits made after migration.
- The transaction uses Prisma `Serializable` isolation. A concurrent edit to any role, including an otherwise unchanged role, or a phantom role insert causes the whole transaction to roll back before the marker is written.

## TDD evidence

RED was recorded before implementation:

```text
SyntaxError: requested module './roleMigrationService' does not provide export CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY

SyntaxError: requested module './roleMigrationService' does not provide export createCustomerPermissionMigrationManifestAuthenticator

AssertionError: CUSTOMER_DELETE 必须有显式叶子，全部/delete 不得隐式授权

AssertionError: Missing expected rejection: hash 后无需迁移的角色若被并发加入 CUSTOMER_DELETE，完整角色集复核必须中止

Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'server/routes/runtimeStorageRoutes'

AssertionError: 迁移写入默认超级管理员的显式 CUSTOMER_DELETE 必须穿过真实 authService 链保留
```

GREEN verification from the final implementation:

```text
pnpm exec tsx server/services/roleMigrationService.test.ts
exit 0

pnpm test
182 test files passed.
exit 0

pnpm run build
tsc -b && vite build
exit 0

git diff --check
exit 0
```

The repository runtime's Node binary was added to `PATH` for these commands because the ambient shell did not expose `node`.

## Release procedure and safety boundary

1. Confirm the existing role-permission baseline is at version 4.
2. Generate at least 32 random bytes for the server-only `CUSTOMER_PERMISSION_MIGRATION_SIGNING_KEY`; provide the same secret to capture, apply, and release startup without writing it into the manifest or logs.
3. On a production-data copy that exactly matches the role data to be released, run `capture --out private_reports/customer-permission-manifest.json`.
4. Apply that exact file with `apply-manifest --file private_reports/customer-permission-manifest.json` before starting the new release.
5. Keep role writes frozen and stop old writers during the release window.
6. Stop the release if the role data changed, the signature/checksum is invalid, an ID is missing/added/unknown, or the manifest/marker is malformed.
7. Start the server; it completes the serializable customer migration and full-set verification before accepting HTTP traffic.

Task 2 migrates persisted roles but intentionally does not replace the remaining live legacy `CUSTOMER_EDIT` / `CUSTOMER_ASSIGN` route and service gates. Task 3 must wire every customer operation to its explicit permission leaf, including the live delete command path, before the permission split is considered fully released.

No push or deployment was performed.
