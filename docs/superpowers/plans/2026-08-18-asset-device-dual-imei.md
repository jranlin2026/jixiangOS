# Device Asset Dual IMEI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Represent one physical device as one asset record with one required IMEI for single-SIM devices and two required IMEIs for dual-SIM devices.

**Architecture:** Add a small shared IMEI normalization module used by local and server command paths, then move the device type to explicit `imei1`/`imei2` fields with read compatibility for legacy `imei`. Update the existing asset page and CSV paths without introducing a child table or changing device counts.

**Tech Stack:** TypeScript, React 18, Zustand, MUI, Node assert tests executed with `tsx`, Prisma-backed application storage.

**Spec:** `docs/superpowers/specs/2026-08-18-asset-device-dual-imei-design.md`

## Global Constraints

- One `AssetDevice` record represents one physical device.
- Single-SIM requires `IMEI 1` and rejects `IMEI 2`; dual-SIM requires both.
- Every IMEI is unique across both IMEI positions of all devices.
- Legacy `imei` and `imeiMasked` records remain readable as IMEI 1.
- ICCID, IMSI, EID and the phone-slot relationship are outside this change.
- The existing asset table, detail workspace, permission checks and pagination semantics remain intact.

---

## File Map

- Create `src/domain/assets/deviceImei.ts`: canonical legacy-read normalization and uniqueness helpers shared by browser and server paths.
- Create `src/domain/assets/deviceImei.test.ts`: isolated behavior tests for normalization and cross-slot conflicts.
- Modify `src/types/asset.ts`: canonical device and sensitive-field contracts.
- Modify `src/api/mock/data/assets.ts`: canonical dual- and single-SIM fixtures.
- Modify `src/api/assetApi.ts`: local CRUD, search, reveal, CSV template/import behavior.
- Modify `src/api/assetApi.test.ts`: local-mode dual IMEI and import regressions.
- Modify `server/services/assetCommandService.ts`: authoritative write validation and canonical persistence.
- Modify `server/services/assetCommandService.test.ts`: command-service validation and legacy compatibility regressions.
- Modify `server/services/assetStorageAccess.ts`: canonicalize and mask both IMEI values on storage reads.
- Modify `server/services/assetStorageAccess.test.ts`: verify both raw IMEIs are protected.
- Modify `src/pages/Assets/index.tsx`: form, list, detail, search copy and export UI.

### Task 1: Shared IMEI Model and Types

**Files:**
- Create: `src/domain/assets/deviceImei.ts`
- Test: `src/domain/assets/deviceImei.test.ts`
- Modify: `src/types/asset.ts`

**Interfaces:**
- Produces: `readDeviceImeis(device): DeviceImeiFields`
- Produces: `validateDeviceImeis(input, devices, currentDeviceId?): DeviceImeiFields`
- Produces: canonical `AssetDevice.imei1`, `imei1Masked`, optional `imei2`, `imei2Masked`; optional legacy read aliases `imei`, `imeiMasked`

- [ ] **Step 1: Write failing normalization and validation tests**

```ts
assert.deepEqual(readDeviceImeis({ imei: 'LEGACY-1', imeiMasked: 'LEG***-1' }), {
  imei1: 'LEGACY-1', imei1Masked: 'LEG***-1', imei2: undefined, imei2Masked: undefined,
});
assert.throws(() => validateDeviceImeis({ simType: '双卡', imei1: 'ONE' }, []), /IMEI 2不能为空/);
assert.throws(() => validateDeviceImeis({ simType: '单卡', imei1: 'ONE', imei2: 'TWO' }, []), /单卡设备不能填写IMEI 2/);
assert.throws(() => validateDeviceImeis({ simType: '双卡', imei1: 'ONE', imei2: 'ONE' }, []), /不能相同/);
assert.throws(() => validateDeviceImeis(
  { simType: '双卡', imei1: 'NEW-1', imei2: 'LEGACY-1' },
  [{ id: 'old', imei: 'LEGACY-1', simType: '单卡' }],
), /IMEI 2已存在/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx src/domain/assets/deviceImei.test.ts`  
Expected: FAIL because `deviceImei.ts` does not exist.

- [ ] **Step 3: Implement the shared module and canonical types**

```ts
export type DeviceImeiFields = {
  imei1: string;
  imei1Masked: string;
  imei2?: string;
  imei2Masked?: string;
};

export function readDeviceImeis(device: DeviceImeiLike): DeviceImeiFields;
export function validateDeviceImeis(
  input: DeviceImeiLike,
  devices: Array<DeviceImeiLike & { id?: string }>,
  currentDeviceId?: string,
): DeviceImeiFields;
```

`readDeviceImeis` trims fields, falls back from `imei1` to legacy `imei`, and creates a masked value only when a stored mask is absent. `validateDeviceImeis` enforces SIM-type cardinality, same-device inequality and cross-slot global uniqueness, returning canonical values.

- [ ] **Step 4: Run the isolated test**

Run: `npx tsx src/domain/assets/deviceImei.test.ts`  
Expected: PASS. Full-project type consistency is checked after all consumers move to the canonical fields in Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/domain/assets/deviceImei.ts src/domain/assets/deviceImei.test.ts src/types/asset.ts
git commit -m "feat(assets): model device IMEI slots"
```

### Task 2: Authoritative Server Writes and Storage Privacy

**Files:**
- Modify: `server/services/assetCommandService.test.ts`
- Modify: `server/services/assetCommandService.ts`
- Modify: `server/services/assetStorageAccess.test.ts`
- Modify: `server/services/assetStorageAccess.ts`

**Interfaces:**
- Consumes: `readDeviceImeis`, `validateDeviceImeis`, canonical `AssetDevice`
- Produces: create/update commands that persist canonical fields and storage projections that mask both IMEIs

- [ ] **Step 1: Change command tests to describe desired behavior**

```ts
const created = await service.createDevice({
  deviceName: '新设备', brandModel: 'iPhone 16', simType: '双卡',
  imei1: 'RAW-NEW-IMEI-1', imei2: 'RAW-NEW-IMEI-2',
  ownerSubject: '公司', departmentId: 'dept-assets',
}, deviceWriter);
assert.equal(created.data?.imei1, 'RAW-NEW-IMEI-1');
assert.equal(created.data?.imei2, 'RAW-NEW-IMEI-2');

const missingSecond = await service.createDevice({
  deviceName: '错误设备', brandModel: 'iPhone 16', simType: '双卡', imei1: 'ONLY-ONE',
}, deviceWriter);
assert.equal(missingSecond.code, 400);
assert.match(missingSecond.message, /IMEI 2不能为空/);
```

Add cross-slot duplicates in both directions and a single-SIM-with-IMEI-2 case. Update the storage test fixture to contain two raw and two masked values, asserting unauthorized projections expose neither raw value.

- [ ] **Step 2: Run server tests and verify RED**

Run: `npx tsx server/services/assetCommandService.test.ts && npx tsx server/services/assetStorageAccess.test.ts`  
Expected: FAIL because commands and storage sanitizer still use the legacy single field.

- [ ] **Step 3: Implement canonical server behavior**

Use `validateDeviceImeis` inside both command transactions after loading locked state. Persist `imei1`, `imei1Masked`, optional `imei2`, `imei2Masked`, remove legacy aliases from newly written objects, and retain the existing HTTP response codes by translating IMEI validation failures to 400 for cardinality/masked input and 409 for uniqueness conflicts.

Use `readDeviceImeis` inside `sanitizeDevice`; return canonical masked fields for users without sensitive permission and canonical raw fields for authorized users, including legacy stored records.

- [ ] **Step 4: Run server tests and verify GREEN**

Run: `npx tsx server/services/assetCommandService.test.ts && npx tsx server/services/assetStorageAccess.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/assetCommandService.ts server/services/assetCommandService.test.ts server/services/assetStorageAccess.ts server/services/assetStorageAccess.test.ts
git commit -m "feat(assets): enforce dual IMEI device writes"
```

### Task 3: Local API, Search, Sensitive Reveal and CSV

**Files:**
- Modify: `src/api/assetApi.test.ts`
- Modify: `src/api/assetApi.ts`
- Modify: `src/api/mock/data/assets.ts`

**Interfaces:**
- Consumes: shared IMEI helpers and canonical device types
- Produces: matching browser-local behavior, two-column import template, legacy import alias, two-field reveal

- [ ] **Step 1: Add failing local API tests**

```ts
const created = await assetApi.createDevice({
  deviceName: '测试资产机', brandModel: 'iPhone Test', simType: '双卡',
  imei1: 'TEST-IMEI-1', imei2: 'TEST-IMEI-2',
});
assert.equal(created.code, 0);
assert.equal(created.data.imei2, 'TEST-IMEI-2');

const conflict = await assetApi.createDevice({
  deviceName: '冲突设备', brandModel: 'Test', simType: '单卡', imei1: 'TEST-IMEI-2',
});
assert.notEqual(conflict.code, 0);
assert.match(conflict.message, /IMEI 1已存在/);
```

Assert the device import template includes `IMEI 1*` and `IMEI 2`, a dual-SIM CSV row without IMEI 2 fails, a complete row succeeds, and `revealSensitiveField('device', id, 'imei2')` returns only the second value.

- [ ] **Step 2: Run the local API test and verify RED**

Run: `npx tsx src/api/assetApi.test.ts`  
Expected: FAIL because local CRUD and CSV still consume one IMEI.

- [ ] **Step 3: Implement local API and fixtures**

Call `validateDeviceImeis` in local create/update. Make `filterDevices` search both canonical masked values. Change device CSV headers and samples to `IMEI 1*`, `IMEI 2`; accept legacy `IMEI*` as an IMEI 1 alias. Extend sensitive fields to `imei1 | imei2`, label and audit each reveal separately, and reject IMEI 2 reveal on a single-SIM record.

Convert mock device fixtures to canonical fields, giving each dual-SIM fixture two unique IMEIs and each single-SIM fixture only IMEI 1.

- [ ] **Step 4: Run the local API test and verify GREEN**

Run: `npx tsx src/api/assetApi.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/assetApi.ts src/api/assetApi.test.ts src/api/mock/data/assets.ts
git commit -m "feat(assets): support dual IMEI API workflows"
```

### Task 4: Asset Page Form, Table, Detail and Export

**Files:**
- Modify: `src/pages/Assets/index.tsx`

**Interfaces:**
- Consumes: canonical `AssetDevice` and `AssetSensitiveField`
- Produces: conditional dual-IMEI form and two-value asset presentation

- [ ] **Step 1: Use the tested domain behavior as the UI acceptance seam**

Before UI edits, run: `npx tsx src/domain/assets/deviceImei.test.ts && npx tsx src/api/assetApi.test.ts`  
Expected: PASS, proving the rules the form submits to.

- [ ] **Step 2: Implement form and presentation**

Move SIM type before IMEI inputs. Render `IMEI 1` as required for all devices and render `IMEI 2` only when `formState.values.simType === '双卡'`, also required. When SIM type changes to single, retain the entered IMEI 2 so save is explicitly blocked until the user clears it; show the server/local validation message through the existing feedback path.

Update the device table cell and detail workspace to show labeled masked IMEI 1 and optional IMEI 2 with separate reveal actions. Update search placeholder copy and export rows to output `IMEI 1` and `IMEI 2` columns.

- [ ] **Step 3: Run build verification**

Run: `npm run build`  
Expected: TypeScript and Vite build succeed.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Assets/index.tsx
git commit -m "feat(assets): add dual IMEI device form"
```

### Task 5: Full Regression and Final Review

**Files:**
- Modify only files required to fix regressions caused by Tasks 1-4.

**Interfaces:**
- Consumes: all prior task outputs
- Produces: release-ready dual-IMEI behavior with no known regression

- [ ] **Step 1: Run focused regression tests**

Run: `npx tsx src/domain/assets/deviceImei.test.ts && npx tsx src/api/assetApi.test.ts && npx tsx server/services/assetCommandService.test.ts && npx tsx server/services/assetStorageAccess.test.ts`  
Expected: PASS.

- [ ] **Step 2: Run the full suite**

Run: `npm test`  
Expected: every discovered `src/**/*.test.ts` and `server/**/*.test.ts` file passes.

- [ ] **Step 3: Run the production build**

Run: `npm run build`  
Expected: TypeScript and Vite build succeed without errors.

- [ ] **Step 4: Review the implementation diff**

Check `git diff HEAD~4 --check` and `git diff HEAD~4 --stat`; verify legacy reads, raw-value masking, both uniqueness directions, CSV headers, form requirements and the one-device count invariant are all represented in code and tests.

- [ ] **Step 5: Commit any review fixes**

Stage the exact regression files reported by `git status --short`, excluding the pre-existing `.codex_tmp/` and `极享AI浏览器员工插件` paths, then run `git commit -m "fix(assets): close dual IMEI review gaps"`.

Skip this commit when review finds no necessary changes.
