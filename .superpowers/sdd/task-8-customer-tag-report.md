# Task 8 Report: Exact Grouped Customer Tag Filtering

## Implemented

- Repeated stable `tagId` query serialization; strict server validation for ID count, mode, booleans, active tags, and active customer groups.
- Exact MySQL `JSON_CONTAINS` filtering for `any`, `all`, grouped OR-within/AND-across, no manual tags, missing group, and exact legacy-name compatibility.
- Identical local mock semantics before pagination, ensuring totals and pages match filtered results.
- Responsive preset-tag popover supporting grouped/any/all, no-manual-tags, missing-group, apply, clear, page reset, and repeated-ID URL state.
- Tag SQL remains combined with lifecycle, deleted-state, and visibility scope for both count and paginated item queries.

## TDD and verification

- RED: grouped local fixtures initially returned every customer; the server semantic test initially failed because the matcher did not exist.
- GREEN: client, service, and data-visibility focused tests passed.
- `pnpm exec tsc -b --pretty false`, `pnpm test`, and `pnpm build` passed with the bundled Codex Node runtime on 2026-07-12.

The generic `.superpowers/sdd/task-8-report.md` was already occupied by the Knowledge and Publishing UI task, so this report uses a collision-safe name.

## Review fixes

- Added one shared catalog validator used by backend and local mock; unknown, inactive, wrong-scope tags and missing groups now return code 400 consistently.
- Extracted URL read/write pure functions with regression tests. Customer state now follows `searchParams` changes, including browser back/forward, without an effect that writes the URL.
- Added explicit catalog loading, rejection/API-error display, retry, disabled dependent controls, and handled Promise rejection in the popover.
- Added direct `customerListService.list` coverage that captures count/item SQL and proves exact JSON conditions, shared combined visibility scope, totals, page size, and offset.
- Mobile match-mode radios now stack at `xs` and wrap at larger sizes.
- Focused tests, full tests, TypeScript, production build, and `git diff --check` pass.

## Second review fixes

- Apply and clear now choose exactly one request source: a changed URL is fetched only by the search-parameter effect; an unchanged URL performs one direct request. Pure regression tests cover apply, clear, and unchanged state.
- The list behavior fake now executes tag matching and salesperson ownership against mixed Sales A/Sales B fixtures, derives count from the filtered set, and slices the same set for pagination. The service result proves only Sales A matches are returned and count/items stay aligned.
- `tagMatch` is explicitly narrowed to the union in both the HTTP route and radio change handler; no tag-mode `as any` remains.
- Focused tests, data visibility, full tests, TypeScript, production build, and diff checks pass.

## Final review fix

- Customer list requests now use a monotonically increasing sequence token. Only the newest request may update items, pagination, error, or loading; stale successes and stale failures return without touching state.
- Deferred asynchronous tests prove a fast B response remains authoritative after both a slow A success and a slow A failure. Apply/clear single-request regression coverage remains green.
- Focused tests, full tests, TypeScript, production build, and diff checks pass.

### Final test coverage extension

- Added A-first deferred cases for both stale success and stale failure. While B remains pending, assertions prove loading stays true and A cannot alter items, pagination, or error.
- Each case then resolves B and verifies its final state, followed by a successful third request proving later sequence tokens continue to operate normally.
- No production implementation change was required.
