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
