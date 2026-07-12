# Task 7 Report: Preset Manual Tag Selector

## Outcome

- Added one reusable `ManualTagSelector` for customer and lead scopes.
- Replaced free-text tag editing in customer create/edit, customer detail, lead create/edit, and lead detail.
- Payloads now submit only `manualTagIds`; legacy `tags` names are display-only snapshots.
- Added grouped catalog options with group/tag colors, single-group replacement, multi-select support, a 20-tag limit, loading/error UI, and mobile-safe sizing.
- Selected inactive tags remain visible with an `已停用` suffix and cannot be newly selected.
- Customer and lead list/detail views resolve catalog colors and show unmigrated names as neutral `历史未归类` chips.

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
