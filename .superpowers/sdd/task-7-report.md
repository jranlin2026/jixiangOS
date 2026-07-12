# Task 7 Report: Preset Manual Tag Selector

## Outcome

- Added one reusable `ManualTagSelector` for customer and lead scopes.
- Replaced free-text tag editing in customer create/edit, customer detail, lead create/edit, and lead detail.
- Payloads now submit only `manualTagIds`; legacy `tags` names are display-only snapshots.
- Added grouped catalog options with group/tag colors, single-group replacement, multi-select support, a 20-tag limit, loading/error UI, and mobile-safe sizing.
- Business pages fetch only the active scope catalog (`includeInactive=false`), so customer/lead readers never need settings permission.
- Selected inactive IDs remain visible from the record's ID/name snapshot with an `已停用` suffix, can be removed, and cannot be newly selected.
- Customer and lead list/detail views resolve catalog colors and show unmigrated names as neutral `历史未归类` chips.
- Scope-level catalog state deduplicates concurrent row requests, shares successful results, surfaces load failures, and supports retry.
- Server updates load the complete catalog inside the authorized transaction and allow an inactive ID only when it belonged to that record before the update. Unknown/new inactive IDs remain invalid; removal revokes the preservation allowance.
- Customer and lead dialogs use an `xs` single-column and `sm+` two-column layout.

## TDD Evidence

1. Added `src/api/manualTagSelectorStatic.test.ts` before production code.
2. Confirmed RED: `ENOENT` for the missing `ManualTagSelector.tsx`.
3. Implemented the selector and integrations.
4. Confirmed focused tests and TypeScript GREEN.

## Verification

- `pnpm exec tsx src/api/manualTagSelectorStatic.test.ts` — passed
- `pnpm exec tsx src/api/customerDetailTagInputStatic.test.ts` — passed
- `pnpm exec tsx src/api/leadListTagStyleStatic.test.ts` — passed
- `pnpm exec tsc -b --pretty false` — passed
- `pnpm run build` — passed
- `pnpm test` — 134 test files passed
- `git diff --check` — passed

All Node-based commands used the Codex bundled Node runtime at `/Users/nge/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`.
