# Design QA

## Comparison targets

- Source visual truth:
  - `docs/design/boss-cockpit-v2-effect.png`
  - `docs/design/salesperson-management-v2-effect.png`
  - `docs/design/customer-management-v2-effect.png`
- Browser-rendered implementation:
  - `docs/design/qa/boss-cockpit-normalized.png`
  - `docs/design/qa/salesperson-normalized.png`
  - `docs/design/qa/customer-management-normalized-final.png`
- Side-by-side evidence:
  - `docs/design/qa/compare-boss.png`
  - `docs/design/qa/compare-salesperson.png`
  - `docs/design/qa/compare-customer-final.png`

## Capture normalization

- Source pixels: 1672 x 941 for all three source mockups.
- Browser CSS viewport: 1678 x 943, desktop state, light theme.
- Implementation evidence: 1678 x 944 after normalizing the in-app browser's Retina capture scale; density comparison is 1:1 after normalization.
- Browser: Codex in-app browser, authenticated as the local system administrator.
- State: live local business data, so names, counts and missing-target states intentionally differ from the illustrative mock data.

## Primary interactions tested

- Boss cockpit loaded at `/dashboard`; real date and department controls rendered.
- Opened the target configuration dialog and verified company, department and salesperson target fields.
- Opened sales battlefield and drilled into a salesperson.
- Verified server-paginated customer list, completeness column and management-category filters.
- Opened a customer in management mode, switched to full profile mode, and opened the existing detailed editor.
- Checked browser console errors on all three implementation routes: none.

## Required fidelity surfaces

- Typography: hierarchy, weights and wrapping preserve the mock's compact Chinese enterprise-dashboard treatment. Dynamic long values remain readable.
- Spacing/layout: the three-level flow uses the same broad page margins, shallow cards, clear top summary and dense lower workspace as the source. Desktop and mobile grids use existing responsive breakpoints.
- Colors/tokens: white and cool-gray surfaces, purple primary, red intervention and amber execution states remain consistent with the source and existing OS tokens.
- Image quality: the boss hero uses an independent transparent raster asset at production resolution; crop and subject direction match the source rather than using CSS or inline-SVG art.
- Copy/content: labels distinguish data incompleteness, execution exception and business risk; no missing customer activity is presented as a completed AI judgment.
- Accessibility: semantic buttons, labels, alt text, visible state chips and keyboard-reachable controls are present. Table pagination retains the product's unified semantics.

## Findings

No actionable P0/P1/P2 findings remain.

Acceptable differences:

- Live data is much sparser and larger than the illustrative mock data; empty targets are displayed as "未配置" instead of inventing a value.
- Department names and counts come from the current organization model, so they do not exactly match the effect-image examples.
- The customer page intentionally exposes "经营管理 / 完整资料" as two views. This is a product requirement added after the effect image and avoids putting the entire legacy customer record into the management decision surface.

## Comparison history

1. First customer-page pass was too sparse below the decision card (P1 relative to the source). Added the three-card management overview for profile completeness, recent operating activity and next action.
2. Re-captured the customer page and compared it side by side. The lower workspace now preserves the source hierarchy while keeping the full record behind the explicit view switch.
3. Boss and salesperson comparisons showed no remaining P0/P1/P2 design drift; differences are explained by live data and target configuration state.

Focused region comparison was not separately required: the side-by-side desktop boards render all key controls, text, table headers and status chips at readable size.

## Follow-up polish

- P3: after real targets and more follow-up records are entered, revisit the hero sentence wrapping with production-length amounts and names.

final result: passed
