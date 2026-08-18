# Asset Field Model and Unified Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor device, phone-number, and internet-account fields and render their create/edit flows with the existing JixiangOS sectioned business-form UI.

**Architecture:** Add a small asset normalization layer that maps legacy JSON fields to canonical fields, then make both local and server command paths consume the same rules. Keep the three asset aggregates separate and render type-specific `BusinessFormSection` groups inside one shared protected dialog shell.

**Tech Stack:** TypeScript, React 18, Zustand, MUI, Express, Prisma JSON storage, Node assert tests via tsx.

**Spec:** `docs/superpowers/specs/2026-08-18-asset-field-form-redesign.md`

## Global Constraints

- Reuse `DialogCloseTitle`, `BusinessFormSection`, and `ProtectedFormDialog`; do not create a second visual system.
- One device record is one physical device. IMEI is a hardware identifier, not a SIM identity.
- A phone-number asset may exist without a device binding.
- Do not store account passwords.
- Preserve read compatibility for legacy `brandModel`, `simType`, `monthlyCost`, and `permissionStatus` data.
- Keep desktop forms two-column and mobile forms one-column/full-screen.

---

### Task 1: Canonical asset field model and normalization

**Files:**
- Create: `src/domain/assets/assetFields.ts`
- Create: `src/domain/assets/assetFields.test.ts`
- Modify: `src/domain/assets/deviceImei.ts`
- Modify: `src/domain/assets/deviceImei.test.ts`
- Modify: `src/types/asset.ts`

**Interfaces:**
- Produces `normalizeAssetDevice`, `normalizeAssetPhone`, `normalizeAssetAccount`, `readDeviceCommunicationType`, and `readAccountControlStatus`.
- Produces canonical union types for device category/communication/acquisition/status, SIM form/phone status, account category/control status.

- [ ] Write tests with literal legacy fixtures proving `brandModel -> brand/model`, `simType -> communicationType`, `monthlyCost -> monthlyRent`, and `permissionStatus -> controlStatus`.
- [ ] Write IMEI tests proving `无SIM` accepts no IMEI, `单卡/eSIM` require only IMEI 1, and `双卡` requires two unique IMEIs.
- [ ] Run `node node_modules/tsx/dist/cli.mjs src/domain/assets/assetFields.test.ts` and `deviceImei.test.ts`; confirm failures are missing canonical behavior.
- [ ] Implement canonical types and normalizers with legacy aliases accepted only as fallbacks.
- [ ] Re-run both tests and `npx tsc -b --pretty false`.
- [ ] Commit `feat(assets): define canonical asset fields`.

### Task 2: Local and server command rules

**Files:**
- Modify: `src/api/assetApi.ts`
- Modify: `src/api/assetApi.test.ts`
- Modify: `server/services/assetCommandService.ts`
- Modify: `server/services/assetCommandService.test.ts`
- Modify: `server/services/assetStorageAccess.ts`
- Modify: `server/services/assetStorageAccess.test.ts`

**Interfaces:**
- Consumes Task 1 normalizers and canonical status readers.
- Produces create/update behavior that writes canonical fields and list/detail behavior that normalizes legacy rows.

- [ ] Add failing local and server tests for an unbound phone, an occupied slot, canonical device fields, and account `controlStatus` driving offboarding.
- [ ] Run the three targeted test files and confirm each new assertion fails for the intended missing behavior.
- [ ] Update create/update/filter/detail/risk/offboarding logic to normalize inputs and allow `deviceId`/`slotType` to be absent together.
- [ ] Extend sensitive reveal/sanitization to ICCID and IMSI.
- [ ] Re-run targeted tests and typecheck.
- [ ] Commit `feat(assets): enforce canonical asset workflows`.

### Task 3: Import, export, search, and presentation semantics

**Files:**
- Modify: `src/api/assetApi.ts`
- Modify: `src/api/assetApi.test.ts`
- Modify: `server/services/assetListService.ts`
- Modify: `server/services/assetListService.test.ts`
- Modify: `src/pages/Assets/index.tsx`

**Interfaces:**
- Consumes canonical normalized asset rows from Tasks 1-2.
- Produces CSV templates/parsers and list/detail labels matching the new field model.

- [ ] Add failing tests for new CSV headers, legacy CSV fallback, unbound-phone search/listing, and canonical field search.
- [ ] Run targeted tests and confirm expected literal header/search failures.
- [ ] Update templates, examples, parsers, exports, list columns, detail fields, status labels, and relationship summaries.
- [ ] Re-run API/list tests and typecheck.
- [ ] Commit `feat(assets): expose refactored asset fields`.

### Task 4: Unified sectioned create/edit forms

**Files:**
- Create: `src/domain/assets/assetFormModel.ts`
- Create: `src/domain/assets/assetFormModel.test.ts`
- Modify: `src/pages/Assets/index.tsx`
- Reuse: `src/shared/components/BusinessFormSection.tsx`
- Reuse: `src/shared/components/DialogCloseTitle.tsx`
- Reuse: `src/shared/components/ProtectedFormDialog.tsx`

**Interfaces:**
- Produces `getAssetFormSections(type)` and `validateAssetForm(type, values)` for section titles, summaries, and error counts.
- The page consumes these functions and renders four type-specific section groups.

- [ ] Write failing tests asserting exact section titles and validation outcomes for device, phone, and account forms.
- [ ] Run the test and confirm it fails because the form model does not exist.
- [ ] Implement the form model, then replace the flat dialog with the shared close title, protected close behavior, section cards, responsive dialog, and fixed actions.
- [ ] Remove the disabled asset-type selector; add conditional device cost/IMEI and phone binding fields.
- [ ] Re-run the form-model test, asset API tests, and typecheck.
- [ ] Commit `feat(assets): unify sectioned asset forms`.

### Task 5: Verification and review

**Files:**
- Verify all files changed above.

- [ ] Run every asset test under `src/domain/assets`, `src/api`, and `server/services`.
- [ ] Run `npm run build`.
- [ ] Run the full test suite once and report any pre-existing unrelated failure separately.
- [ ] Use the review skill against the pre-feature fixed point and address all actionable findings.
- [ ] Confirm `git diff --check` and a clean worktree.
