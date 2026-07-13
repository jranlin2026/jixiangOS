# Self-service Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every employee securely change their own password and require a password change after account creation or administrator reset.

**Architecture:** Add a `mustChangePassword` flag to the user record and authenticated-user payload. Account creation and administrator reset set the flag; successful self-service change verifies the current password, replaces the hash, clears the flag, and revokes existing sessions. The frontend exposes a normal password dialog from the user area and a blocking dialog when the flag is set.

**Tech Stack:** React, TypeScript, Zustand, Express, Prisma, Vitest, MUI.

## Global Constraints

- Self-service change always verifies the current password.
- New passwords require at least 8 characters and must differ from the current password.
- Password hashes and salts never enter frontend responses.
- Administrator reset remains available and forces a change on next login.
- Existing users are not unexpectedly locked by the schema migration.
- Every behavior change starts with a failing test.

---

## Task 1: Persist and expose the password-change requirement

- [ ] Add a failing mapper/auth payload test for `mustChangePassword`.
- [ ] Add `mustChangePassword Boolean @default(false)` to `prisma/schema.prisma` and create a migration.
- [ ] Update `server/db/prismaMappers.ts`, `src/types/settings.ts`, `src/types/auth.ts`, and `src/shared/utils/permissions.ts`.
- [ ] Generate the Prisma client and run mapper/auth tests.

## Task 2: Mark created and reset accounts

- [ ] Add failing `settingsService` tests asserting new users and reset users are flagged.
- [ ] Update `server/services/settingsService.ts` to set the flag on create/reset.
- [ ] Revoke the reset user's existing sessions after an administrator reset.
- [ ] Run settings service tests.

## Task 3: Implement self-service password change

- [ ] Add failing `authService` tests for wrong current password, weak password, reused password, success, cleared flag, and session revocation.
- [ ] Implement `changePassword` in `server/services/authService.ts` using the existing password hashing helpers.
- [ ] Add an authenticated `POST /api/auth/change-password` endpoint in `server/index.ts`.
- [ ] Ensure logs and responses never contain password values.
- [ ] Run auth service and endpoint tests.

## Task 4: Add the employee password dialog

- [ ] Add `authApi.changePassword` and the matching Zustand action.
- [ ] Build a reusable `ChangePasswordDialog` with current password, new password, confirmation, validation, loading state, and clear errors.
- [ ] Add a “修改密码” action beside the signed-in employee area in `src/layouts/Sidebar.tsx`.
- [ ] On success, clear local authentication and return to login with a success message.
- [ ] Add focused component/store tests and run them.

## Task 5: Enforce first-login change

- [ ] Add a failing component test proving the dialog cannot be dismissed when `mustChangePassword` is true.
- [ ] Mount the forced dialog in `src/layouts/AppLayout.tsx` and block normal navigation until completion.
- [ ] Confirm ordinary users can open and close the optional dialog later.
- [ ] Run frontend tests and `pnpm build`.

## Task 6: End-to-end verification

- [ ] Create a test employee and confirm first login opens the blocking dialog.
- [ ] Change the password and confirm the old password fails and the new password succeeds.
- [ ] Perform an administrator reset and confirm existing sessions are revoked and the next login is forced to change.
- [ ] Run all targeted auth, settings, mapper, store, and UI tests.

