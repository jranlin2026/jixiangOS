# Customer Tag Whole-Branch Review Fix Report

Date: 2026-07-12

Base: `52ccae3`

Scope: all five findings from the final whole-branch review

## Fixes

1. Tag merge now updates the real `tags` compatibility snapshot together with `manualTagIds` for both `business_records` customer/lead rows and `lead_records`, inside the existing catalog transaction. Tests assert the real fields and absence of the accidental `manualTagNames` field.
2. Lead bulk import loads `fetchCustomerTagCatalog('lead', false)` exactly once before reading/validating the batch. A 403 response is returned unchanged and network errors reject; neither path writes any lead. The implementation no longer reads `TAGS` or `TAG_GROUPS` from browser storage.
3. CRM missing-tag synchronization now uses the record-level customer-tag group/tag APIs. Every command is awaited, 409 conflicts trigger authoritative refresh and name matching, and 403/other failures propagate. No local `TAGS` write remains.
4. Legacy migration preview reports cross-group duplicate-name ambiguities with tag/group IDs and includes them in its checksum. Apply returns 409 before business/audit writes while ambiguity exists. The settings dialog explains the remediation and disables apply.
5. `ManualTagSelector` catalog cache has a 60-second TTL, per-scope generations, and an exported invalidation function. Successful settings mutations and migration apply invalidate lead/customer selector caches immediately. Mounted selectors subscribe to the generation, actively reload after invalidation, deduplicate same-generation requests, discard stale pending responses, and leave failed loads retryable.

## Verification

- Focused tests: PASS
  - `server/services/customerTagService.test.ts`
  - `src/api/leadBulkImportApi.test.ts`
  - `src/api/crmMigrationTagSync.test.ts`
  - `server/services/customerTagMigrationService.test.ts`
  - `src/api/manualTagSelectorStatic.test.ts`
  - `src/shared/utils/manualTagCatalogCache.test.ts` (pending request invalidation race, mounted reload, scope deduplication, TTL expiry, retry)
- `pnpm exec tsc -b --pretty false`: PASS
- `pnpm test`: PASS, 138 test files
- `pnpm build`: PASS, 2867 modules transformed
- `git diff --check`: PASS

## Remaining boundary

No real database, live server, production deployment, or production data was accessed. The existing Task 9 conclusion remains unchanged: staging database/browser role smoke is still required before production release.

## Final review follow-up

- Catalog group scope/selection-mode changes and tag group moves now simulate the resulting catalog under the shared write lock, scan customer records, business-record leads, and real `LeadRecord` rows, and atomically reject assignment conflicts.
- Migration preview now reports structured `assignmentConflicts`, includes them in the checksum, and apply performs zero business/audit writes when ambiguity or assignment conflicts exist. The settings dialog explains and blocks apply.
- Added super-admin-only atomic group merge with explicit same-name conflict blocking, assignment replay, source deactivation, audit record, API client, and settings confirmation dialog.
- CRM precheck loads the authoritative full catalog; the obsolete free-text `useCustomerStore.updateTags` path was removed.
