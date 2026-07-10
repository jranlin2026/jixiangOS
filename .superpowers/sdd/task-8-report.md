# Task 8 report — Knowledge and Publishing UI

## Two-pass design plan (before implementation)

Subject: 极享公司内部赋能知识中台。Audience: employees who need current policy/process knowledge, department reviewers, and knowledge publishers. Single job: find the current approved answer quickly, then move immutable Markdown versions through review and publication with unambiguous permissions and status.

### Pass 1 — proposed system

- Palette: 极享蓝 `#1E6BFF` for primary actions/current state; ink `#101828`; slate `#667085`; page wash `#F6F8FB`; border `#DDE4EC`; workflow amber `#B46A08` and approval green `#16845B` only where lifecycle meaning requires them.
- Type: existing `Inter` + `Noto Sans SC` for body and controls; restrained 900-weight Noto/Inter display role for the page title; tabular utility labels use the same family at 12px/800 to preserve the product's compact operational character.
- Layout: keep the existing ModuleShell/MUI rhythm. Desktop uses a quiet full-width header and two-column publishing workspace; mobile collapses to one column and horizontal tabs.
- Signature: a lifecycle rail that reads `草稿 → 待审核 → 已通过 → 当前生效` and highlights the server-authoritative status on every workflow card.

```text
desktop                                  mobile
┌ title + purpose ───────────────────┐   ┌ title ───────────────┐
├ 企业知识 │ 发布管理 ───────────────┤   ├ tabs (scroll) ───────┤
├ search / guidance ─────────────────┤   ├ search ──────────────┤
├ current knowledge cards ───────────┤   ├ result card ─────────┤
└────────────────────────────────────┘   └───────────────────────┘

publishing
┌ Markdown draft form ┐ ┌ review / publication queues ┐
│ explicit metadata   │ │ lifecycle rail + actions    │
└─────────────────────┘ └──────────────────────────────┘
```

### Pass 2 — brief critique and revision

The first pass risked turning the lifecycle rail into a decorative progress stepper. Revised: it is a compact status contract, shows only real lifecycle stages, uses the current API status as its sole highlight source, and pairs status with exactly the actions the user is permitted to perform. No gradients, oversized metric cards, new typefaces, or decorative motion are added. The rest of the interface stays deliberately native to the existing MUI shell; reduced-motion users get no animated status transition.

## TDD evidence

- RED 1: `pnpm exec tsx src/api/enablementApi.test.ts` failed with `ERR_MODULE_NOT_FOUND` for `src/api/enablementApi`.
- RED 2: `pnpm exec tsx src/api/enablementModuleStatic.test.ts` failed with `ENOENT` for `src/pages/Enablement/index.tsx`.
- GREEN: API, module static, and permission-model tests passed after the minimal client/store/page/route implementation.
- Self-review RED: a new assertion requiring the server's weighted `hit.score` to be shown as `匹配分` failed while the UI incorrectly rendered it as a percentage. The display was corrected and the regression test passed.

## Implementation and verification

- Added a typed backend-only enablement client for browse/search/detail and the complete immutable-version lifecycle.
- Added one in-memory Zustand store for knowledge, search, review, and publication queues. It contains no persistence or business-record fallback.
- Added permission-filtered `/enablement?tab=knowledge|publishing` views, protected routing, and a top-level MUI sidebar entry.
- Knowledge view shows only public DTO fields and includes directional loading, empty, error, browse, and search states.
- Publishing view imports Markdown with `File.text()`, creates immutable drafts/versions, displays department review and publish queues, gates actions by both permission and server status, and refreshes authoritative data after every mutation.
- The compact lifecycle rail is the sole signature treatment; layout collapses responsively, native MUI focus treatment remains visible, and no motion is introduced.
- `pnpm exec tsx src/api/enablementApi.test.ts`: pass.
- `pnpm exec tsx src/api/enablementModuleStatic.test.ts`: pass.
- `pnpm exec tsx src/api/enablementPermissionModel.test.ts`: pass.
- `pnpm test`: pass, 78 test files.
- `pnpm build`: pass, TypeScript and Vite production build.

## Self-review

- Verified no enablement data is written to local storage, shared app storage, or business-record storage.
- Verified the UI never renders private file-store identifiers; only the user-visible source filename is displayed.
- Verified review, publish, submit, upload-new-version, and retire actions are both status-aware and permission-aware.
- No blocker. The UI intentionally relies on the Task 7 backend and does not provide a local fallback.

## Review-fix pass

### RED evidence

- Detail/static regression failed because knowledge cards did not call `getKnowledge` or render `contentText` in a dialog.
- Markdown validator test failed with `ERR_MODULE_NOT_FOUND`; both upload handlers previously trusted browser `accept` alone.
- Store concurrency test failed after the review request completed while the publication request remained active: `loading` incorrectly changed to `false`.
- Permission regression failed because route/sidebar used the umbrella permission, allowing a sensitive-only grant to expose a dead end.
- Repository contract test failed with `{ status: 'APPROVED' }` instead of the required authoritative `{ status: { in: ['DRAFT', 'REJECTED', 'APPROVED'] } }` queue.
- Workflow/static regression failed while `WorkflowCard` was declared inside `PublishingCenter` and review content was absent.

### GREEN changes

- Browse and search cards are keyboard-actionable and open an accessible responsive MUI dialog. The dialog fetches the current detail on demand and shows Markdown as safe text with version, category, sensitivity, and effective/update times.
- The publisher queue now returns DRAFT, REJECTED, and APPROVED versions. Drafts can submit after reload; rejected versions can resubmit or upload a corrected immutable version; approved versions can publish.
- Review cards show the full submitted Markdown in a bounded, keyboard-scrollable source panel before decision controls.
- `WorkflowCard` is module-scoped and receives comment/action callbacks explicitly, preserving input focus across parent renders.
- Store loading uses a pending-request counter. Parallel queue refreshes remain loading until every request settles; the concurrency test proves the first completion cannot expose false empty states.
- Every file input uses `.md,text/markdown`, and both selection handlers and mutation functions validate the `.md` extension and Markdown-compatible MIME before `File.text()`.
- Route/sidebar gates now list only knowledge, review, and publish permissions; sensitive-only permission no longer exposes the module.

### Review-fix verification

- Focused API, module, permission, Markdown validation, store concurrency, and repository queue tests: pass.
- `pnpm test`: pass, 80 test files.
- `pnpm build`: pass, TypeScript and Vite production build.
