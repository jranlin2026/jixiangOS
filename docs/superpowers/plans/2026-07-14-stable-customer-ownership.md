# Stable Customer Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use immutable employee IDs for customer and lead ownership so duplicate names cannot merge visibility, while safely classifying imported legacy records.

**Architecture:** Keep the employee name as a display snapshot, and persist `ownerId` plus an ownership resolution status in each business record's JSON data. Every new create, assign, claim, and import operation writes the ID. Visibility checks prefer IDs and never grant access to records explicitly marked unresolved or ambiguous. A maintenance action previews and applies a one-time legacy backfill.

**Tech Stack:** React, TypeScript, Zustand, Express, Prisma, Vitest, MUI.

## Global Constraints

- Names are display values only; authorization must never depend on a non-unique name.
- Duplicate employee names remain allowed.
- Missing and ambiguous imported owners stay unassigned until an administrator resolves them.
- Existing API consumers keep receiving the `owner` display name.
- Every behavior change starts with a failing test.

---

## Task 1: Define the stable ownership model

- [ ] Add `ownerId` and `ownerIdentityStatus` to `Customer` and customer create/update inputs in `src/types/customer.ts`.
- [ ] Add stable assignee fields to `src/types/lead.ts` where lead/customer synchronization needs them.
- [ ] Add unit tests for ownership resolution: unique match, missing employee, and duplicate-name ambiguity.
- [ ] Implement a small pure resolver in `server/services/customerOwnerIdentityService.ts`.
- [ ] Run the resolver tests.

## Task 2: Write IDs on every ownership-changing command

- [ ] Extend `server/services/customerCommandService.test.ts` with same-name employees having different IDs.
- [ ] Change assignment input from employee name to employee ID in `server/index.ts` and `server/services/customerCommandService.ts`.
- [ ] Ensure create, assign, public-pool claim, public-pool release, and customer-to-lead synchronization write or clear stable IDs and statuses consistently.
- [ ] Change `src/api/customerApi.ts` and customer assignment UI to submit employee IDs and display disambiguating account/position metadata.
- [ ] Change `src/pages/Customers/CustomerForm.tsx` to submit the selected employee ID with the name snapshot.
- [ ] Run command-service and frontend type/build checks.

## Task 3: Make visibility ID-first

- [ ] Add failing client visibility tests for two employees with the same name and for unresolved records.
- [ ] Add failing server list tests covering `ownerId`, unresolved imports, and the legacy fallback.
- [ ] Update `src/shared/utils/dataVisibility.ts` so `ownerId` wins and unresolved/ambiguous rows never match by name.
- [ ] Update `server/services/customerListService.ts` SQL filtering to use JSON `ownerId`; allow name fallback only for untouched legacy rows without an identity status.
- [ ] Run customer-list and visibility tests.

## Task 4: Resolve ownership during CRM import

- [ ] Add import tests proving unique names receive an ID and missing/duplicate names receive a non-resolved status.
- [ ] Expand CRM migration employee data to include IDs in `src/api/crmMigrationApi.ts`.
- [ ] Resolve ownership server-side in `server/services/storageService.ts` before persistence so client data cannot forge ownership.
- [ ] Show resolved, missing, and ambiguous owner counts in the migration result.
- [ ] Run CRM migration and storage tests.

## Task 5: Backfill existing customer data safely

- [ ] Add tests for a preview/apply service that does not overwrite records already carrying an ID or explicit status.
- [ ] Implement preview and apply operations in `server/services/customerOwnerIdentityService.ts`.
- [ ] Add authenticated maintenance endpoints in `server/index.ts` guarded by data-maintenance write access.
- [ ] Add a maintenance UI action that previews counts, requires confirmation, applies the backfill, and reports unresolved records.
- [ ] Run related service/UI tests and `pnpm build`.

## Task 6: End-to-end verification

- [ ] Create two employees with the same name and confirm assignment choices are distinguishable.
- [ ] Assign different customers to each employee and verify they only see their own records.
- [ ] Import rows with unique, missing, and duplicate employee names and verify their statuses.
- [ ] Run all targeted customer, migration, and permission tests.

