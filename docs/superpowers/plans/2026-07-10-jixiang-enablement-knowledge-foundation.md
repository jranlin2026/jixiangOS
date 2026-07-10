# Jixiang Enablement Knowledge Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first deployable increment of the Jixiang enablement platform: permission-controlled Markdown knowledge import, department review, immutable publication, retirement, browsing, and current-version keyword search.

**Architecture:** Implement a server-authoritative enablement domain with dedicated Prisma tables, a lifecycle service behind a repository interface, authenticated `/api/enablement/knowledge` routes, and a minimal `/enablement` UI. Store original Markdown in a private directory outside the existing public `/uploads` mount; store searchable chunks in MySQL; do not use localStorage, `AppStorage`, or `BusinessRecord`.

**Tech Stack:** React 18, TypeScript, MUI 6, Zustand, Express 5, Prisma 6.19.3, MySQL 8.4, Node `assert` tests executed through `tsx`.

## Global Constraints

- First increment supports Markdown only; PDF, PPT, video, courses, exams, onboarding, and AI answers belong to later rollout increments.
- Reuse existing login, users, departments, roles, `createRequireAuth`, `backendRequest`, and MySQL connection.
- All reads and mutations are server-side and permission checked; never add enablement keys to runtime storage hydration.
- A department review requires both review permission and either `Department.managerId === actor.id` or super-admin access.
- Publication requires publish permission, an approved version, successfully stored source, generated chunks, and one database transaction that swaps the current version.
- Only `CURRENT` versions inside their effective date range can appear in employee browse or search.
- Retirement removes a document from current browse/search without deleting versions, reviews, chunks, or source files.
- Private source files live under `ENABLEMENT_PRIVATE_STORAGE_DIR`, never under the existing public `uploads/` root.
- Every user, department, reviewer, publisher, and creator reference uses a stable ID; names are display-only snapshots.
- Do not modify the existing AI Assistant behavior.
- Follow the server-authoritative direction in `docs/superpowers/specs/2026-07-10-core-business-architecture-refactor-design.md`.
- Preserve unrelated worktree changes, especially `src/pages/Customers/index.tsx`, `.local/`, `.recovery/`, and `src/api/customerReleaseListScopeStatic.test.ts`.

---

## File Responsibility Map

### Shared contracts and permissions

- Modify `src/shared/utils/constants.ts` — add the `/enablement` route.
- Modify `src/shared/utils/permissions.ts` — define enablement capabilities and grant hierarchy.
- Modify `src/pages/Settings/RolePermission.tsx` — expose enablement capabilities to role administrators.
- Create `src/types/enablement.ts` — stable client/server DTOs, states, and command inputs.

### Database and server domain

- Modify `prisma/schema.prisma` — add typed knowledge models.
- Create `prisma/migrations/20260710010000_enablement_knowledge_foundation/migration.sql` — additive MySQL schema.
- Create `server/services/enablement/knowledgePolicy.ts` — visibility and department-review decisions.
- Create `server/services/enablement/knowledgeSearchProvider.ts` — replaceable keyword search implementation.
- Create `server/services/enablement/knowledgeRepository.ts` — repository interface.
- Create `server/services/enablement/prismaKnowledgeRepository.ts` — Prisma implementation and publish transaction.
- Create `server/services/enablement/knowledgeFileStore.ts` — safe private Markdown source storage.
- Create `server/services/enablement/knowledgeService.ts` — lifecycle application service.
- Create `server/routes/enablementKnowledgeRoutes.ts` — authenticated HTTP routes.
- Modify `server/config/runtime.ts` — private storage configuration.
- Modify `server/index.ts` — compose and mount the enablement router only.
- Modify `.env.example` — document `ENABLEMENT_PRIVATE_STORAGE_DIR`.
- Modify `.gitignore` — exclude private runtime files.

### Client

- Create `src/api/enablementApi.ts` — typed backend client with no local fallback.
- Modify `src/api/index.ts` — export the enablement API.
- Create `src/store/useEnablementStore.ts` — knowledge and publishing state.
- Create `src/pages/Enablement/index.tsx` — permission-aware enablement shell.
- Create `src/pages/Enablement/KnowledgeCenter.tsx` — employee browse/search/detail view.
- Create `src/pages/Enablement/PublishingCenter.tsx` — import, submit, review, publish, and retire workflow.
- Modify `src/App.tsx` — protected enablement route.
- Modify `src/layouts/Sidebar.tsx` — visible top-level navigation.

### Tests and documentation

- Create `src/api/enablementPermissionModel.test.ts`.
- Create `server/services/enablement/knowledgePolicy.test.ts`.
- Create `server/services/enablement/knowledgeSearchProvider.test.ts`.
- Create `server/services/enablement/knowledgeService.test.ts`.
- Create `server/services/enablement/knowledgeFileStore.test.ts`.
- Create `server/routes/enablementKnowledgeRoutes.test.ts`.
- Create `src/api/enablementApi.test.ts`.
- Create `src/api/enablementModuleStatic.test.ts`.
- Modify `docs/jixiang-os-project-knowledge-base.md` — record the increment and its boundary.

---

### Task 1: Add Enablement Permission Contracts

**Files:**
- Modify: `src/shared/utils/constants.ts:2-23`
- Modify: `src/shared/utils/permissions.ts:12-118`
- Modify: `src/shared/utils/permissions.ts:122-330`
- Modify: `src/pages/Settings/RolePermission.tsx:41-190`
- Test: `src/api/enablementPermissionModel.test.ts`

**Interfaces:**
- Produces: `ROUTES.ENABLEMENT` with value `/enablement`.
- Produces: `PERMISSION_KEYS.ENABLEMENT`, `ENABLEMENT_KNOWLEDGE`, `ENABLEMENT_REVIEW`, `ENABLEMENT_PUBLISH`, and `ENABLEMENT_SENSITIVE`.
- Produces: parent permission grants that let a child capability make the enablement parent visible.
- Consumes: existing `hasPermission()`, `getDefaultPermissionActions()`, and role-permission UI conventions.

- [ ] **Step 1: Write the failing permission-model test**

```ts
// src/api/enablementPermissionModel.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';
import type { AuthenticatedUser } from '../types/auth';

const constantsSource = readFileSync(join(process.cwd(), 'src/shared/utils/constants.ts'), 'utf8');
const rolePermissionSource = readFileSync(join(process.cwd(), 'src/pages/Settings/RolePermission.tsx'), 'utf8');

assert.match(constantsSource, /ENABLEMENT:\s*'\/enablement'/);
assert.match(rolePermissionSource, /label:\s*'赋能中台'/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.ENABLEMENT_KNOWLEDGE/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.ENABLEMENT_REVIEW/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.ENABLEMENT_PUBLISH/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.ENABLEMENT_SENSITIVE/);

const reader: AuthenticatedUser = {
  id: 'user-reader', name: 'Reader', account: 'reader', email: '', phone: '', role: 'Employee' as any,
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE, actions: ['read'] }], isActive: true,
};
assert.equal(hasPermission(reader, PERMISSION_KEYS.ENABLEMENT), true);
assert.equal(hasPermission(reader, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE), true);
assert.equal(hasPermission(reader, PERMISSION_KEYS.ENABLEMENT_REVIEW, 'write'), false);

const publisher: AuthenticatedUser = {
  ...reader,
  id: 'user-publisher',
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_PUBLISH, actions: ['read', 'write'] }],
};
assert.equal(hasPermission(publisher, PERMISSION_KEYS.ENABLEMENT), true);
assert.equal(hasPermission(publisher, PERMISSION_KEYS.ENABLEMENT_PUBLISH, 'write'), true);
```

- [ ] **Step 2: Run the test and observe the missing contracts**

Run: `pnpm exec tsx src/api/enablementPermissionModel.test.ts`

Expected: FAIL because `ROUTES.ENABLEMENT` and the enablement permission keys do not exist.

- [ ] **Step 3: Add route and permission constants**

```ts
// src/shared/utils/constants.ts inside ROUTES
ENABLEMENT: '/enablement',

// src/shared/utils/permissions.ts inside PERMISSION_KEYS
ENABLEMENT: '赋能中台',
ENABLEMENT_KNOWLEDGE: '赋能中台/企业知识',
ENABLEMENT_REVIEW: '赋能中台/知识审核',
ENABLEMENT_PUBLISH: '赋能中台/发布管理',
ENABLEMENT_SENSITIVE: '赋能中台/查看敏感知识',
```

Add this grant subtree next to AI Assistant:

```ts
[PERMISSION_KEYS.ENABLEMENT]: [
  PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE,
  PERMISSION_KEYS.ENABLEMENT_REVIEW,
  PERMISSION_KEYS.ENABLEMENT_PUBLISH,
  PERMISSION_KEYS.ENABLEMENT_SENSITIVE,
],
[PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE]: [PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE],
[PERMISSION_KEYS.ENABLEMENT_REVIEW]: [PERMISSION_KEYS.ENABLEMENT_REVIEW],
[PERMISSION_KEYS.ENABLEMENT_PUBLISH]: [PERMISSION_KEYS.ENABLEMENT_PUBLISH],
[PERMISSION_KEYS.ENABLEMENT_SENSITIVE]: [PERMISSION_KEYS.ENABLEMENT_SENSITIVE],
```

Add review and publish to `WRITE_ACTION_PERMISSION_KEYS` so the existing action normalization remains fail-closed:

```ts
PERMISSION_KEYS.ENABLEMENT_REVIEW,
PERMISSION_KEYS.ENABLEMENT_PUBLISH,
```

- [ ] **Step 4: Expose the permissions in role management**

```tsx
// src/pages/Settings/RolePermission.tsx inside PERMISSION_TREE
{
  label: '赋能中台',
  children: [
    { label: '企业知识', key: PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE },
    { label: '知识审核', key: PERMISSION_KEYS.ENABLEMENT_REVIEW },
    { label: '发布管理', key: PERMISSION_KEYS.ENABLEMENT_PUBLISH },
    { label: '查看敏感知识', key: PERMISSION_KEYS.ENABLEMENT_SENSITIVE },
  ],
},
```

- [ ] **Step 5: Run focused and existing permission tests**

Run:

```bash
pnpm exec tsx src/api/enablementPermissionModel.test.ts
pnpm exec tsx src/api/permissionModel.test.ts
```

Expected: both files exit 0 with no assertion error.

- [ ] **Step 6: Commit the permission contract**

```bash
git add src/shared/utils/constants.ts src/shared/utils/permissions.ts src/pages/Settings/RolePermission.tsx src/api/enablementPermissionModel.test.ts
git commit -m "feat: add enablement permission contracts"
```

---

### Task 2: Add Typed Knowledge Schema and DTOs

**Files:**
- Modify: `prisma/schema.prisma:1-160`
- Create: `prisma/migrations/20260710010000_enablement_knowledge_foundation/migration.sql`
- Create: `src/types/enablement.ts`
- Test: `server/services/enablement/knowledgeSchema.test.ts`

**Interfaces:**
- Produces: immutable `KnowledgeVersion` rows and one `KnowledgeDocument.currentVersionId` pointer.
- Produces: `KnowledgeVisibility`, `ContentReview`, `KnowledgeAttachment`, and `KnowledgeChunk` records.
- Produces: shared `KnowledgeDocumentDto`, `KnowledgeVersionDto`, `KnowledgeSearchHit`, and lifecycle state constants.
- Consumes: existing stable `User.id` and `Department.id` values without adding name-based relationships.

- [ ] **Step 1: Write a failing schema contract test**

```ts
// server/services/enablement/knowledgeSchema.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260710010000_enablement_knowledge_foundation/migration.sql'),
  'utf8',
);
const types = readFileSync(join(process.cwd(), 'src/types/enablement.ts'), 'utf8');

for (const model of ['KnowledgeDocument', 'KnowledgeVersion', 'KnowledgeAttachment', 'KnowledgeVisibility', 'ContentReview', 'KnowledgeChunk']) {
  assert.match(schema, new RegExp(`model ${model} \\{`));
}
assert.match(schema, /currentVersionId\s+String\?/);
assert.match(schema, /@@unique\(\[documentId, versionNumber\]\)/);
assert.match(schema, /@@unique\(\[versionId, ordinal\]\)/);
assert.match(migration, /CREATE TABLE `knowledge_documents`/);
assert.match(migration, /CREATE TABLE `knowledge_versions`/);
assert.match(types, /export const KNOWLEDGE_VERSION_STATUS/);
assert.match(types, /export interface KnowledgeDocumentDto/);
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run: `pnpm exec tsx server/services/enablement/knowledgeSchema.test.ts`

Expected: FAIL because the migration, models, and DTO file do not exist.

- [ ] **Step 3: Add shared lifecycle constants and DTOs**

```ts
// src/types/enablement.ts
export const KNOWLEDGE_VERSION_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CURRENT: 'CURRENT',
  RETIRED: 'RETIRED',
  PUBLISH_FAILED: 'PUBLISH_FAILED',
} as const;

export type KnowledgeVersionStatus = typeof KNOWLEDGE_VERSION_STATUS[keyof typeof KNOWLEDGE_VERSION_STATUS];
export type KnowledgeSensitivity = 'INTERNAL' | 'DEPARTMENT' | 'MANAGEMENT' | 'FINANCE' | 'CUSTOMER';
export type VisibilitySubjectType = 'ALL_EMPLOYEES' | 'DEPARTMENT' | 'ROLE' | 'POSITION';

export interface KnowledgeVisibilityDto {
  id: string;
  subjectType: VisibilitySubjectType;
  subjectId?: string;
}

export interface KnowledgeVersionDto {
  id: string;
  documentId: string;
  versionNumber: number;
  status: KnowledgeVersionStatus;
  sourceFileName: string;
  sourcePath?: string;
  checksum: string;
  effectiveAt?: string;
  expiresAt?: string;
  publishedAt?: string;
  publishedById?: string;
  createdAt: string;
}

export interface KnowledgeDocumentDto {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  ownerDepartmentId: string;
  ownerUserId?: string;
  sensitivity: KnowledgeSensitivity;
  currentVersionId?: string;
  visibility: KnowledgeVisibilityDto[];
  currentVersion?: KnowledgeVersionDto;
  latestVersion?: KnowledgeVersionDto;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocumentDetailDto extends KnowledgeDocumentDto {
  contentText: string;
}

export interface KnowledgeWorkflowItemDto {
  document: KnowledgeDocumentDto;
  version: KnowledgeVersionDto;
  contentText: string;
}

export interface KnowledgeSearchHit {
  documentId: string;
  versionId: string;
  title: string;
  heading?: string;
  excerpt: string;
  score: number;
  versionNumber: number;
  updatedAt: string;
}

export interface CreateKnowledgeDraftInput {
  slug: string;
  title: string;
  category: string;
  summary: string;
  ownerDepartmentId?: string;
  ownerUserId?: string;
  sensitivity: KnowledgeSensitivity;
  visibility: Array<{ subjectType: VisibilitySubjectType; subjectId?: string }>;
  sourceFileName: string;
  sourcePath?: string;
  markdown: string;
  effectiveAt?: string;
  expiresAt?: string;
}

export type CreateKnowledgeVersionInput = Omit<CreateKnowledgeDraftInput,
  'slug' | 'title' | 'category' | 'summary' | 'ownerDepartmentId' | 'ownerUserId' | 'sensitivity' | 'visibility'>;
```

- [ ] **Step 4: Add Prisma models**

Append models with these exact names and constraints to `prisma/schema.prisma`:

```prisma
model KnowledgeDocument {
  id                String   @id @db.VarChar(64)
  slug              String   @unique @db.VarChar(160)
  title             String   @db.VarChar(240)
  category          String   @db.VarChar(120)
  summary           String   @db.Text
  ownerDepartmentId String?  @db.VarChar(64)
  ownerUserId       String?  @db.VarChar(64)
  sensitivity       String   @default("INTERNAL") @db.VarChar(32)
  currentVersionId  String?  @db.VarChar(64)
  createdById       String   @db.VarChar(64)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  versions     KnowledgeVersion[]
  visibilities KnowledgeVisibility[]

  @@index([ownerDepartmentId])
  @@index([ownerUserId])
  @@index([currentVersionId])
  @@map("knowledge_documents")
}

model KnowledgeVersion {
  id              String   @id @db.VarChar(64)
  documentId      String   @db.VarChar(64)
  versionNumber   Int
  status          String   @default("DRAFT") @db.VarChar(32)
  sourceFileName  String   @db.VarChar(255)
  sourcePath      String?  @db.VarChar(1000)
  checksum        String   @db.VarChar(64)
  contentText     String   @db.LongText
  effectiveAt     DateTime?
  expiresAt       DateTime?
  publishedAt     DateTime?
  publishedById   String?  @db.VarChar(64)
  createdById     String   @db.VarChar(64)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  document   KnowledgeDocument  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  attachments KnowledgeAttachment[]
  reviews     ContentReview[]
  chunks      KnowledgeChunk[]

  @@unique([documentId, versionNumber])
  @@index([status])
  @@index([effectiveAt, expiresAt])
  @@map("knowledge_versions")
}

model KnowledgeAttachment {
  id          String   @id @db.VarChar(64)
  versionId   String   @db.VarChar(64)
  fileName    String   @db.VarChar(255)
  mimeType    String   @db.VarChar(120)
  byteSize    Int
  storageKey  String   @unique @db.VarChar(500)
  checksum    String   @db.VarChar(64)
  createdById String   @db.VarChar(64)
  createdAt   DateTime @default(now())

  version KnowledgeVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)

  @@index([versionId])
  @@map("knowledge_attachments")
}

model KnowledgeVisibility {
  id          String   @id @db.VarChar(64)
  documentId  String   @db.VarChar(64)
  subjectType String   @db.VarChar(32)
  subjectId   String   @default("*") @db.VarChar(64)
  createdAt   DateTime @default(now())

  document KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, subjectType, subjectId])
  @@index([subjectType, subjectId])
  @@map("knowledge_visibilities")
}

model ContentReview {
  id             String   @id @db.VarChar(64)
  versionId      String   @db.VarChar(64)
  reviewerUserId String   @db.VarChar(64)
  decision       String   @db.VarChar(24)
  comment        String?  @db.Text
  reviewedAt     DateTime @default(now())

  version KnowledgeVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)

  @@index([versionId, reviewedAt])
  @@map("content_reviews")
}

model KnowledgeChunk {
  id        String   @id @db.VarChar(64)
  versionId String   @db.VarChar(64)
  ordinal   Int
  heading   String?  @db.VarChar(500)
  content   String   @db.LongText
  searchText String  @db.LongText
  createdAt DateTime @default(now())

  version KnowledgeVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)

  @@unique([versionId, ordinal])
  @@index([versionId])
  @@map("knowledge_chunks")
}
```

- [ ] **Step 5: Create the additive migration**

Create `prisma/migrations/20260710010000_enablement_knowledge_foundation/migration.sql` from the six models. The SQL must:

```sql
CREATE TABLE `knowledge_documents` (
  `id` VARCHAR(64) NOT NULL,
  `slug` VARCHAR(160) NOT NULL,
  `title` VARCHAR(240) NOT NULL,
  `category` VARCHAR(120) NOT NULL,
  `summary` TEXT NOT NULL,
  `ownerDepartmentId` VARCHAR(64) NULL,
  `ownerUserId` VARCHAR(64) NULL,
  `sensitivity` VARCHAR(32) NOT NULL DEFAULT 'INTERNAL',
  `currentVersionId` VARCHAR(64) NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `knowledge_documents_slug_key`(`slug`),
  INDEX `knowledge_documents_ownerDepartmentId_idx`(`ownerDepartmentId`),
  INDEX `knowledge_documents_ownerUserId_idx`(`ownerUserId`),
  INDEX `knowledge_documents_currentVersionId_idx`(`currentVersionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_versions` (
  `id` VARCHAR(64) NOT NULL,
  `documentId` VARCHAR(64) NOT NULL,
  `versionNumber` INTEGER NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  `sourceFileName` VARCHAR(255) NOT NULL,
  `sourcePath` VARCHAR(1000) NULL,
  `checksum` VARCHAR(64) NOT NULL,
  `contentText` LONGTEXT NOT NULL,
  `effectiveAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `publishedById` VARCHAR(64) NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `knowledge_versions_documentId_versionNumber_key`(`documentId`, `versionNumber`),
  INDEX `knowledge_versions_status_idx`(`status`),
  INDEX `knowledge_versions_effectiveAt_expiresAt_idx`(`effectiveAt`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_attachments` (
  `id` VARCHAR(64) NOT NULL, `versionId` VARCHAR(64) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL, `mimeType` VARCHAR(120) NOT NULL,
  `byteSize` INTEGER NOT NULL, `storageKey` VARCHAR(500) NOT NULL,
  `checksum` VARCHAR(64) NOT NULL, `createdById` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `knowledge_attachments_storageKey_key`(`storageKey`),
  INDEX `knowledge_attachments_versionId_idx`(`versionId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_visibilities` (
  `id` VARCHAR(64) NOT NULL, `documentId` VARCHAR(64) NOT NULL,
  `subjectType` VARCHAR(32) NOT NULL, `subjectId` VARCHAR(64) NOT NULL DEFAULT '*',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `knowledge_visibilities_documentId_subjectType_subjectId_key`(`documentId`, `subjectType`, `subjectId`),
  INDEX `knowledge_visibilities_subjectType_subjectId_idx`(`subjectType`, `subjectId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `content_reviews` (
  `id` VARCHAR(64) NOT NULL, `versionId` VARCHAR(64) NOT NULL,
  `reviewerUserId` VARCHAR(64) NOT NULL, `decision` VARCHAR(24) NOT NULL,
  `comment` TEXT NULL, `reviewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `content_reviews_versionId_reviewedAt_idx`(`versionId`, `reviewedAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_chunks` (
  `id` VARCHAR(64) NOT NULL, `versionId` VARCHAR(64) NOT NULL,
  `ordinal` INTEGER NOT NULL, `heading` VARCHAR(500) NULL,
  `content` LONGTEXT NOT NULL, `searchText` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `knowledge_chunks_versionId_ordinal_key`(`versionId`, `ordinal`),
  INDEX `knowledge_chunks_versionId_idx`(`versionId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `knowledge_versions` ADD CONSTRAINT `knowledge_versions_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `knowledge_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `knowledge_attachments` ADD CONSTRAINT `knowledge_attachments_versionId_fkey`
  FOREIGN KEY (`versionId`) REFERENCES `knowledge_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `knowledge_visibilities` ADD CONSTRAINT `knowledge_visibilities_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `knowledge_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `content_reviews` ADD CONSTRAINT `content_reviews_versionId_fkey`
  FOREIGN KEY (`versionId`) REFERENCES `knowledge_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `knowledge_chunks` ADD CONSTRAINT `knowledge_chunks_versionId_fkey`
  FOREIGN KEY (`versionId`) REFERENCES `knowledge_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
```

Do not add a database foreign key from `knowledge_documents.currentVersionId` in this migration because it creates a cycle during draft creation; enforce that pointer inside the publish transaction and repository tests.

- [ ] **Step 6: Validate schema and focused contract**

Run:

```bash
pnpm exec prisma format
pnpm exec prisma validate
pnpm exec tsx server/services/enablement/knowledgeSchema.test.ts
```

Expected: Prisma reports the schema is valid; the test exits 0.

- [ ] **Step 7: Commit schema and types**

```bash
git add prisma/schema.prisma prisma/migrations/20260710010000_enablement_knowledge_foundation/migration.sql src/types/enablement.ts server/services/enablement/knowledgeSchema.test.ts
git commit -m "feat: add enablement knowledge schema"
```

---

### Task 3: Implement Visibility and Review Policy

**Files:**
- Create: `server/services/enablement/knowledgePolicy.ts`
- Test: `server/services/enablement/knowledgePolicy.test.ts`

**Interfaces:**
- Consumes: `AuthenticatedUser`, `KnowledgeSensitivity`, `KnowledgeVisibilityDto`, and existing `hasPermission()`.
- Produces: `canReadKnowledge(actor, document)`, `canReviewKnowledge(actor, department)`, and `canPublishKnowledge(actor)`.

- [ ] **Step 1: Write failing policy tests**

```ts
// server/services/enablement/knowledgePolicy.test.ts
import assert from 'node:assert/strict';
import { PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import { canPublishKnowledge, canReadKnowledge, canReviewKnowledge } from './knowledgePolicy';

const employee = {
  id: 'user-sales', name: 'Sales', account: 'sales', email: '', phone: '', role: 'Employee',
  departmentId: 'dept-sales', roleId: 'role-sales', positionId: 'pos-sales', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE, actions: ['read'] }],
} as any;
const reviewer = {
  ...employee, id: 'user-manager',
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_REVIEW, actions: ['read', 'write'] }],
} as any;
const publisher = {
  ...employee, id: 'user-publisher',
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_PUBLISH, actions: ['read', 'write'] }],
} as any;

assert.equal(canReadKnowledge(employee, { sensitivity: 'INTERNAL', visibility: [{ id: 'v1', subjectType: 'ALL_EMPLOYEES' }] } as any), true);
assert.equal(canReadKnowledge(employee, { sensitivity: 'DEPARTMENT', visibility: [{ id: 'v2', subjectType: 'DEPARTMENT', subjectId: 'dept-sales' }] } as any), true);
assert.equal(canReadKnowledge(employee, { sensitivity: 'DEPARTMENT', visibility: [{ id: 'v3', subjectType: 'DEPARTMENT', subjectId: 'dept-finance' }] } as any), false);
assert.equal(canReadKnowledge(employee, { sensitivity: 'FINANCE', visibility: [{ id: 'v4', subjectType: 'ALL_EMPLOYEES' }] } as any), false);
assert.equal(canReviewKnowledge(reviewer, { id: 'dept-sales', managerId: 'user-manager' } as any), true);
assert.equal(canReviewKnowledge(reviewer, { id: 'dept-finance', managerId: 'user-finance' } as any), false);
assert.equal(canPublishKnowledge(publisher), true);
assert.equal(canPublishKnowledge(employee), false);
```

- [ ] **Step 2: Run the test and observe the missing module**

Run: `pnpm exec tsx server/services/enablement/knowledgePolicy.test.ts`

Expected: FAIL with module-not-found for `knowledgePolicy`.

- [ ] **Step 3: Implement fail-closed policy functions**

```ts
// server/services/enablement/knowledgePolicy.ts
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { KnowledgeDocumentDto } from '../../../src/types/enablement';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';

type DepartmentFacts = { id: string; managerId?: string | null };

export function canReadKnowledge(actor: AuthenticatedUser, document: Pick<KnowledgeDocumentDto, 'sensitivity' | 'visibility'>): boolean {
  if (!hasPermission(actor, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE)) return false;
  if (document.sensitivity !== 'INTERNAL' && !hasPermission(actor, PERMISSION_KEYS.ENABLEMENT_SENSITIVE)) {
    if (document.sensitivity !== 'DEPARTMENT') return false;
  }
  return document.visibility.some((rule) => (
    rule.subjectType === 'ALL_EMPLOYEES'
    || (rule.subjectType === 'DEPARTMENT' && rule.subjectId === actor.departmentId)
    || (rule.subjectType === 'ROLE' && rule.subjectId === actor.roleId)
    || (rule.subjectType === 'POSITION' && rule.subjectId === actor.positionId)
  ));
}

export function canReviewKnowledge(actor: AuthenticatedUser, department: DepartmentFacts): boolean {
  if (isSuperAdmin(actor)) return true;
  return hasPermission(actor, PERMISSION_KEYS.ENABLEMENT_REVIEW, 'write') && department.managerId === actor.id;
}

export function canPublishKnowledge(actor: AuthenticatedUser): boolean {
  return hasPermission(actor, PERMISSION_KEYS.ENABLEMENT_PUBLISH, 'write');
}
```

Super-admin behavior continues through the existing `hasPermission` all-access rule. Do not add name-based exceptions.

- [ ] **Step 4: Run policy and authentication tests**

Run:

```bash
pnpm exec tsx server/services/enablement/knowledgePolicy.test.ts
pnpm exec tsx server/middleware/auth.test.ts
```

Expected: both exit 0.

- [ ] **Step 5: Commit the policy**

```bash
git add server/services/enablement/knowledgePolicy.ts server/services/enablement/knowledgePolicy.test.ts
git commit -m "feat: enforce enablement knowledge policy"
```

---

### Task 4: Implement Markdown Chunking and Keyword Search

**Files:**
- Create: `server/services/enablement/knowledgeSearchProvider.ts`
- Test: `server/services/enablement/knowledgeSearchProvider.test.ts`

**Interfaces:**
- Produces: `buildMarkdownChunks(markdown): DraftKnowledgeChunk[]`.
- Produces: `createKeywordKnowledgeSearchProvider().search(query, chunks, limit): KnowledgeSearchHit[]`.
- Consumes: only already permission-filtered current chunks; the provider never decides access.

- [ ] **Step 1: Write failing chunk and ranking tests**

```ts
// server/services/enablement/knowledgeSearchProvider.test.ts
import assert from 'node:assert/strict';
import { buildMarkdownChunks, createKeywordKnowledgeSearchProvider } from './knowledgeSearchProvider';

const markdown = `# 公司介绍
极享科技是一家AI应用产品公司。

## 新人红线
禁止承诺保本、稳赚和固定收入。

## 请假流程
请假先提交申请，再由部门负责人审批。`;

const chunks = buildMarkdownChunks(markdown);
assert.equal(chunks.length, 3);
assert.equal(chunks[1].heading, '新人红线');
assert.match(chunks[1].content, /禁止承诺保本/);

const provider = createKeywordKnowledgeSearchProvider();
const hits = provider.search('新人不能承诺稳赚', chunks.map((chunk, index) => ({
  ...chunk,
  id: `chunk-${index}`,
  documentId: 'doc-1',
  versionId: 'version-1',
  title: '新人手册',
  versionNumber: 1,
  updatedAt: '2026-07-10T00:00:00.000Z',
})), 5);
assert.equal(hits[0].heading, '新人红线');
assert.ok(hits[0].score > 0);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec tsx server/services/enablement/knowledgeSearchProvider.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement deterministic Markdown chunking**

```ts
// server/services/enablement/knowledgeSearchProvider.ts
import type { KnowledgeSearchHit } from '../../../src/types/enablement';

export type DraftKnowledgeChunk = { ordinal: number; heading?: string; content: string; searchText: string };
export type SearchableKnowledgeChunk = DraftKnowledgeChunk & {
  id: string; documentId: string; versionId: string; title: string; versionNumber: number; updatedAt: string;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ').trim();
const terms = (value: string) => [...new Set(normalize(value).split(/\s+/).filter(Boolean).flatMap((term) => (
  term.length > 2 && /[\u4e00-\u9fff]/.test(term)
    ? [term, ...Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2))]
    : [term]
)))];

export function buildMarkdownChunks(markdown: string): DraftKnowledgeChunk[] {
  const sections: Array<{ heading?: string; lines: string[] }> = [];
  let current = { heading: undefined as string | undefined, lines: [] as string[] };
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim();
    if (heading) {
      if (current.lines.join('\n').trim() || current.heading) sections.push(current);
      current = { heading, lines: [] };
    } else current.lines.push(line);
  }
  if (current.lines.join('\n').trim() || current.heading) sections.push(current);
  return sections.map((section, ordinal) => {
    const content = section.lines.join('\n').trim();
    return { ordinal, heading: section.heading, content, searchText: normalize(`${section.heading || ''} ${content}`) };
  }).filter((chunk) => chunk.heading || chunk.content);
}
```

- [ ] **Step 4: Implement replaceable keyword ranking**

```ts
export interface KnowledgeSearchProvider {
  search(query: string, chunks: SearchableKnowledgeChunk[], limit: number): KnowledgeSearchHit[];
}

export function createKeywordKnowledgeSearchProvider(): KnowledgeSearchProvider {
  return {
    search(query, chunks, limit) {
      const queryTerms = terms(query);
      return chunks.map((chunk) => {
        const heading = normalize(chunk.heading || '');
        const score = queryTerms.reduce((total, term) => total
          + (heading.includes(term) ? 5 : 0)
          + (chunk.searchText.includes(term) ? 1 : 0), 0);
        return {
          documentId: chunk.documentId, versionId: chunk.versionId, title: chunk.title,
          heading: chunk.heading, excerpt: chunk.content.slice(0, 240), score,
          versionNumber: chunk.versionNumber, updatedAt: chunk.updatedAt,
        };
      }).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    },
  };
}
```

- [ ] **Step 5: Run the focused test**

Run: `pnpm exec tsx server/services/enablement/knowledgeSearchProvider.test.ts`

Expected: exits 0 and ranks the compliance section first.

- [ ] **Step 6: Commit search infrastructure**

```bash
git add server/services/enablement/knowledgeSearchProvider.ts server/services/enablement/knowledgeSearchProvider.test.ts
git commit -m "feat: add enablement knowledge search"
```

---

### Task 5: Implement the Knowledge Lifecycle Service

**Files:**
- Create: `server/services/enablement/knowledgeRepository.ts`
- Create: `server/services/enablement/knowledgeService.ts`
- Test: `server/services/enablement/knowledgeService.test.ts`

**Interfaces:**
- Consumes: `KnowledgeRepository`, `buildMarkdownChunks`, policy functions, actor IDs, and DTO command inputs.
- Produces: `createKnowledgeService(deps)` with `createDraft`, `createVersion`, `submitForReview`, `review`, `publish`, `retire`, `listCurrent`, `getCurrent`, `listReviewQueue`, `listPublicationQueue`, and `searchCurrent`.
- Produces: explicit lifecycle failures through existing `ApiResponse` helpers.

- [ ] **Step 1: Define the repository boundary**

```ts
// server/services/enablement/knowledgeRepository.ts
import type { KnowledgeDocumentDetailDto, KnowledgeDocumentDto, KnowledgeWorkflowItemDto } from '../../../src/types/enablement';
import type { DraftKnowledgeChunk, SearchableKnowledgeChunk } from './knowledgeSearchProvider';

export type KnowledgeVersionRecord = {
  id: string; documentId: string; versionNumber: number; status: string;
  sourceFileName: string; checksum: string; contentText: string;
  effectiveAt?: Date | null; expiresAt?: Date | null;
};

export interface KnowledgeRepository {
  createDraft(input: Record<string, unknown>): Promise<{ document: KnowledgeDocumentDto; version: KnowledgeVersionRecord }>;
  createVersion(documentId: string, input: Record<string, unknown>): Promise<{ document: KnowledgeDocumentDto; version: KnowledgeVersionRecord }>;
  findVersion(id: string): Promise<KnowledgeVersionRecord | null>;
  findDocument(id: string): Promise<KnowledgeDocumentDto | null>;
  findCurrentDetail(id: string, now: Date): Promise<KnowledgeDocumentDetailDto | null>;
  findDepartment(id: string): Promise<{ id: string; managerId?: string | null } | null>;
  transitionVersion(versionId: string, allowedFrom: string[], nextStatus: string): Promise<boolean>;
  reviewAtomic(input: { versionId: string; expectedStatus: 'PENDING_REVIEW'; reviewerUserId: string; decision: 'APPROVE' | 'REJECT'; comment?: string; nextStatus: 'APPROVED' | 'REJECTED' }): Promise<boolean>;
  publishAtomic(input: { version: KnowledgeVersionRecord; publisherUserId: string; chunks: DraftKnowledgeChunk[]; now: Date }): Promise<KnowledgeDocumentDto>;
  retireAtomic(documentId: string, actorUserId: string, now: Date): Promise<void>;
  listVisibleCurrent(now: Date): Promise<KnowledgeDocumentDto[]>;
  listReviewQueue(): Promise<KnowledgeWorkflowItemDto[]>;
  listPublicationQueue(): Promise<KnowledgeWorkflowItemDto[]>;
  listSearchableChunks(now: Date): Promise<SearchableKnowledgeChunk[]>;
}
```

- [ ] **Step 2: Write failing lifecycle tests with an in-memory repository**

```ts
// server/services/enablement/knowledgeService.test.ts
import assert from 'node:assert/strict';
import { KNOWLEDGE_VERSION_STATUS } from '../../../src/types/enablement';
import { createKnowledgeService } from './knowledgeService';
import { createKeywordKnowledgeSearchProvider } from './knowledgeSearchProvider';

const events: string[] = [];
const versions = new Map<string, any>();
const documents = new Map<string, any>();
const repository: any = {
  createDraft: async (input: any) => {
    const document = { id: 'doc-1', ...input, visibility: input.visibility, createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z' };
    const version = { id: 'version-1', documentId: 'doc-1', versionNumber: 1, status: 'DRAFT', sourceFileName: input.sourceFileName, checksum: input.checksum, contentText: input.markdown };
    documents.set(document.id, document); versions.set(version.id, version); return { document, version };
  },
  findVersion: async (id: string) => versions.get(id) || null,
  findDocument: async (id: string) => documents.get(id) || null,
  findDepartment: async () => ({ id: 'dept-sales', managerId: 'user-manager' }),
  transitionVersion: async (id: string, allowed: string[], status: string) => {
    const version = versions.get(id);
    if (!version || !allowed.includes(version.status)) return false;
    version.status = status; events.push(status); return true;
  },
  reviewAtomic: async ({ versionId, decision, nextStatus }: any) => {
    const version = versions.get(versionId);
    if (!version || version.status !== 'PENDING_REVIEW') return false;
    events.push(`REVIEW:${decision}`); version.status = nextStatus; events.push(nextStatus); return true;
  },
  publishAtomic: async ({ version, chunks }: any) => { events.push(`PUBLISH:${chunks.length}`); version.status = 'CURRENT'; return documents.get(version.documentId); },
  retireAtomic: async () => events.push('RETIRE'),
  listVisibleCurrent: async () => [...documents.values()],
  listReviewQueue: async () => [...documents.values()],
  listSearchableChunks: async () => [],
};
const service = createKnowledgeService({ repository, searchProvider: createKeywordKnowledgeSearchProvider(), now: () => new Date('2026-07-10T00:00:00.000Z') });
const creator = { id: 'user-admin', departmentId: 'dept-sales', permissions: [{ module: '全部', actions: ['admin'] }] } as any;
const manager = { id: 'user-manager', departmentId: 'dept-sales', permissions: [{ module: '赋能中台/知识审核', actions: ['read', 'write'] }] } as any;

const draft = await service.createDraft({ slug: 'company-intro', title: '公司介绍', category: '公司认知', summary: '介绍', ownerDepartmentId: 'dept-sales', sensitivity: 'INTERNAL', visibility: [{ subjectType: 'ALL_EMPLOYEES' }], sourceFileName: '公司介绍.md', markdown: '# 公司介绍\n极享科技。' }, creator);
assert.equal(draft.code, 0);
assert.equal(draft.data.version.status, KNOWLEDGE_VERSION_STATUS.DRAFT);
assert.equal((await service.submitForReview('version-1', creator)).code, 0);
assert.equal((await service.review('version-1', { decision: 'APPROVE', comment: '通过' }, manager)).code, 0);
assert.equal((await service.publish('version-1', creator)).code, 0);
assert.deepEqual(events, ['PENDING_REVIEW', 'REVIEW:APPROVE', 'APPROVED', 'PUBLISH:1']);

const secondPublish = await service.publish('version-1', creator);
assert.notEqual(secondPublish.code, 0);

repository.createVersion = async (documentId: string, input: any) => {
  const version = { id: 'version-2', documentId, versionNumber: 2, status: 'DRAFT', sourceFileName: input.sourceFileName, checksum: input.checksum, contentText: input.markdown };
  versions.set(version.id, version);
  return { document: documents.get(documentId), version };
};
const nextVersion = await service.createVersion('doc-1', { sourceFileName: '公司介绍-v2.md', markdown: '# 公司介绍\n第二版。' }, creator);
assert.equal(nextVersion.code, 0);
assert.equal(nextVersion.data.version.versionNumber, 2);
```

- [ ] **Step 3: Run the test and verify the service is missing**

Run: `pnpm exec tsx server/services/enablement/knowledgeService.test.ts`

Expected: FAIL with module-not-found for `knowledgeService`.

- [ ] **Step 4: Implement state validation and commands**

```ts
// server/services/enablement/knowledgeService.ts
import { createHash, randomUUID } from 'node:crypto';
import { failure, success } from '../../api/response';
import { KNOWLEDGE_VERSION_STATUS, type CreateKnowledgeDraftInput, type CreateKnowledgeVersionInput } from '../../../src/types/enablement';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { KnowledgeRepository } from './knowledgeRepository';
import type { KnowledgeSearchProvider } from './knowledgeSearchProvider';
import { buildMarkdownChunks } from './knowledgeSearchProvider';
import { canPublishKnowledge, canReadKnowledge, canReviewKnowledge } from './knowledgePolicy';

type KnowledgeSourceStore = {
  writeMarkdown(input: { documentId: string; versionId: string; fileName: string; markdown: string }): Promise<{ storageKey: string; byteSize: number }>;
};

export function createKnowledgeService(deps: { repository: KnowledgeRepository; searchProvider: KnowledgeSearchProvider; fileStore?: KnowledgeSourceStore; now?: () => Date }) {
  const now = deps.now || (() => new Date());
  return {
    async createDraft(input: CreateKnowledgeDraftInput, actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return failure('无权创建知识草稿', 403);
      if (!input.title.trim() || !input.slug.trim() || !input.ownerDepartmentId || !input.markdown.trim()) return failure('标题、标识、归属部门和Markdown正文不能为空');
      if (!input.visibility.length) return failure('至少配置一个可见范围');
      if (input.effectiveAt && input.expiresAt && new Date(input.expiresAt) <= new Date(input.effectiveAt)) return failure('失效时间必须晚于生效时间');
      const checksum = createHash('sha256').update(input.markdown, 'utf8').digest('hex');
      const id = `doc-${randomUUID()}`;
      const versionId = `kv-${randomUUID()}`;
      const stored = deps.fileStore
        ? await deps.fileStore.writeMarkdown({ documentId: id, versionId, fileName: input.sourceFileName, markdown: input.markdown })
        : null;
      return success(await deps.repository.createDraft({ ...input, checksum, createdById: actor.id, id, versionId, attachment: stored }));
    },
    async createVersion(documentId: string, input: CreateKnowledgeVersionInput, actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return failure('无权创建知识版本', 403);
      const document = await deps.repository.findDocument(documentId);
      if (!document || !input.sourceFileName.trim() || !input.markdown.trim()) return failure('文档、新版本文件名和正文不能为空');
      const checksum = createHash('sha256').update(input.markdown, 'utf8').digest('hex');
      const versionId = `kv-${randomUUID()}`;
      const stored = deps.fileStore
        ? await deps.fileStore.writeMarkdown({ documentId, versionId, fileName: input.sourceFileName, markdown: input.markdown })
        : null;
      return success(await deps.repository.createVersion(documentId, { ...input, checksum, createdById: actor.id, versionId, attachment: stored }));
    },
    async submitForReview(versionId: string, _actor: AuthenticatedUser) {
      if (!canPublishKnowledge(_actor)) return failure('无权提交知识审核', 403);
      const version = await deps.repository.findVersion(versionId);
      if (!version || ![KNOWLEDGE_VERSION_STATUS.DRAFT, KNOWLEDGE_VERSION_STATUS.REJECTED].includes(version.status as any)) return failure('只有草稿或驳回版本可以提交审核');
      const moved = await deps.repository.transitionVersion(
        versionId,
        [KNOWLEDGE_VERSION_STATUS.DRAFT, KNOWLEDGE_VERSION_STATUS.REJECTED],
        KNOWLEDGE_VERSION_STATUS.PENDING_REVIEW,
      );
      if (!moved) return failure('版本状态已变化，请刷新后重试', 409);
      return success(true);
    },
    async review(versionId: string, input: { decision: 'APPROVE' | 'REJECT'; comment?: string }, actor: AuthenticatedUser) {
      const version = await deps.repository.findVersion(versionId);
      const document = version ? await deps.repository.findDocument(version.documentId) : null;
      const department = document?.ownerDepartmentId ? await deps.repository.findDepartment(document.ownerDepartmentId) : null;
      if (!version || !document || !department) return failure('审核对象或归属部门不存在');
      if (version.status !== KNOWLEDGE_VERSION_STATUS.PENDING_REVIEW) return failure('只有待审核版本可以审核');
      if (!canReviewKnowledge(actor, department)) return failure('无权审核该部门知识', 403);
      const moved = await deps.repository.reviewAtomic({
        versionId,
        expectedStatus: KNOWLEDGE_VERSION_STATUS.PENDING_REVIEW,
        reviewerUserId: actor.id,
        decision: input.decision,
        comment: input.comment?.trim(),
        nextStatus: input.decision === 'APPROVE' ? KNOWLEDGE_VERSION_STATUS.APPROVED : KNOWLEDGE_VERSION_STATUS.REJECTED,
      });
      if (!moved) return failure('版本已被其他审核人处理，请刷新后重试', 409);
      return success(true);
    },
    async publish(versionId: string, actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return failure('无权发布公司知识', 403);
      const version = await deps.repository.findVersion(versionId);
      if (!version || version.status !== KNOWLEDGE_VERSION_STATUS.APPROVED) return failure('只有审核通过的版本可以发布');
      const chunks = buildMarkdownChunks(version.contentText);
      if (!chunks.length) return failure('正文无法生成知识片段');
      return success(await deps.repository.publishAtomic({ version, publisherUserId: actor.id, chunks, now: now() }));
    },
    async retire(documentId: string, actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return failure('无权下线公司知识', 403);
      await deps.repository.retireAtomic(documentId, actor.id, now());
      return success(true);
    },
    async listCurrent(actor: AuthenticatedUser) {
      const documents = await deps.repository.listVisibleCurrent(now());
      return success(documents.filter((document) => canReadKnowledge(actor, document)));
    },
    async getCurrent(documentId: string, actor: AuthenticatedUser) {
      const document = await deps.repository.findCurrentDetail(documentId, now());
      if (!document?.currentVersionId || !canReadKnowledge(actor, document)) return failure('知识不存在或无权查看', 404);
      return success(document);
    },
    async listReviewQueue(actor: AuthenticatedUser) {
      const queue = await deps.repository.listReviewQueue();
      const allowed = [];
      for (const item of queue) {
        const departmentId = item.document.ownerDepartmentId;
        const department = departmentId ? await deps.repository.findDepartment(departmentId) : null;
        if (department && canReviewKnowledge(actor, department)) allowed.push(item);
      }
      return success(allowed);
    },
    async listPublicationQueue(actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return failure('无权查看发布队列', 403);
      return success(await deps.repository.listPublicationQueue());
    },
    async searchCurrent(query: string, actor: AuthenticatedUser) {
      const documents = await deps.repository.listVisibleCurrent(now());
      const allowedIds = new Set(documents.filter((document) => canReadKnowledge(actor, document)).map((document) => document.id));
      const chunks = (await deps.repository.listSearchableChunks(now())).filter((chunk) => allowedIds.has(chunk.documentId));
      return success(deps.searchProvider.search(query, chunks, 20));
    },
  };
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
```

- [ ] **Step 5: Add negative transition assertions**

Extend `knowledgeService.test.ts` to assert:

```ts
assert.notEqual((await service.review('version-1', { decision: 'APPROVE' }, { ...manager, id: 'other-user' } as any)).code, 0);
assert.notEqual((await service.submitForReview('missing-version', creator)).code, 0);
assert.notEqual((await service.publish('missing-version', creator)).code, 0);
```

- [ ] **Step 6: Run lifecycle tests**

Run:

```bash
pnpm exec tsx server/services/enablement/knowledgeService.test.ts
pnpm exec tsx server/services/enablement/knowledgePolicy.test.ts
pnpm exec tsx server/services/enablement/knowledgeSearchProvider.test.ts
```

Expected: all exit 0.

- [ ] **Step 7: Commit lifecycle service**

```bash
git add server/services/enablement/knowledgeRepository.ts server/services/enablement/knowledgeService.ts server/services/enablement/knowledgeService.test.ts
git commit -m "feat: add knowledge publication lifecycle"
```

---

### Task 6: Add Private Markdown Storage and Prisma Repository

**Files:**
- Modify: `.gitignore:1-25`
- Modify: `.env.example`
- Modify: `server/config/runtime.ts:1-120`
- Modify: `server/config/runtime.test.ts:1-120`
- Create: `server/services/enablement/knowledgeFileStore.ts`
- Create: `server/services/enablement/knowledgeFileStore.test.ts`
- Create: `server/services/enablement/prismaKnowledgeRepository.ts`
- Test: `server/services/enablement/prismaKnowledgeRepository.test.ts`

**Interfaces:**
- Produces: `getEnablementPrivateStorageDir(env)`.
- Produces: `createKnowledgeFileStore(root).writeMarkdown(input)` and `readMarkdown(storageKey)`.
- Produces: `createPrismaKnowledgeRepository(prisma)` implementing `KnowledgeRepository`.
- Consumes: the Task 2 schema and Task 5 repository contract.

- [ ] **Step 1: Write failing private-storage tests**

```ts
// server/services/enablement/knowledgeFileStore.test.ts
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createKnowledgeFileStore } from './knowledgeFileStore';

const root = await mkdtemp(path.join(tmpdir(), 'jixiang-enablement-'));
try {
  const store = createKnowledgeFileStore(root);
  const result = await store.writeMarkdown({ documentId: 'doc-1', versionId: 'version-1', fileName: '../公司介绍.md', markdown: '# 公司介绍' });
  assert.equal(result.storageKey, 'doc-1/version-1/公司介绍.md');
  assert.equal(await readFile(path.join(root, result.storageKey), 'utf8'), '# 公司介绍');
  await assert.rejects(() => store.readMarkdown('../../.env'), /非法文件路径/);
} finally {
  await rm(root, { recursive: true, force: true });
}
```

- [ ] **Step 2: Run the file-store test and observe failure**

Run: `pnpm exec tsx server/services/enablement/knowledgeFileStore.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Add private storage configuration**

```ts
// server/config/runtime.ts
import path from 'node:path';

export function getEnablementPrivateStorageDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = readEnv(env, 'ENABLEMENT_PRIVATE_STORAGE_DIR');
  return path.resolve(configured || 'private_uploads/enablement');
}
```

Add `private_uploads/` to `.gitignore` and this commented default to `.env.example`:

```dotenv
# ENABLEMENT_PRIVATE_STORAGE_DIR=private_uploads/enablement
```

Add to `runtime.test.ts`:

```ts
assert.equal(getEnablementPrivateStorageDir({ ENABLEMENT_PRIVATE_STORAGE_DIR: '/tmp/enablement' }), '/tmp/enablement');
assert.ok(getEnablementPrivateStorageDir({}).endsWith('private_uploads/enablement'));
```

- [ ] **Step 4: Implement path-safe file storage**

```ts
// server/services/enablement/knowledgeFileStore.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cleanSegment = (value: string) => path.basename(value).replace(/[^\w.\-\u4e00-\u9fff]+/g, '_').slice(0, 180);

export function createKnowledgeFileStore(root: string) {
  const resolvedRoot = path.resolve(root);
  const resolveKey = (key: string) => {
    const target = path.resolve(resolvedRoot, key);
    if (!target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('非法文件路径');
    return target;
  };
  return {
    async writeMarkdown(input: { documentId: string; versionId: string; fileName: string; markdown: string }) {
      const storageKey = `${cleanSegment(input.documentId)}/${cleanSegment(input.versionId)}/${cleanSegment(input.fileName || 'source.md')}`;
      const target = resolveKey(storageKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, input.markdown, 'utf8');
      return { storageKey, byteSize: Buffer.byteLength(input.markdown, 'utf8') };
    },
    async readMarkdown(storageKey: string) {
      return readFile(resolveKey(storageKey), 'utf8');
    },
  };
}
```

- [ ] **Step 5: Implement the Prisma repository and transaction**

In `prismaKnowledgeRepository.ts`, map rows to DTOs in one place and implement `publishAtomic` exactly as one `$transaction`:

```ts
await prisma.$transaction(async (tx) => {
  const current = await tx.knowledgeDocument.findUnique({ where: { id: input.version.documentId } });
  if (!current) throw new Error('知识文档不存在');
  const publishVersion = await tx.knowledgeVersion.findUnique({ where: { id: input.version.id } });
  if (!publishVersion || publishVersion.status !== 'APPROVED') throw new Error('版本状态已变化，无法发布');
  if (current.currentVersionId) {
    await tx.knowledgeVersion.update({ where: { id: current.currentVersionId }, data: { status: 'RETIRED' } });
  }
  await tx.knowledgeChunk.deleteMany({ where: { versionId: input.version.id } });
  await tx.knowledgeChunk.createMany({ data: input.chunks.map((chunk) => ({
    id: `kc-${randomUUID()}`, versionId: input.version.id, ordinal: chunk.ordinal,
    heading: chunk.heading || null, content: chunk.content, searchText: chunk.searchText,
  })) });
  await tx.knowledgeVersion.update({ where: { id: input.version.id }, data: {
    status: 'CURRENT', publishedAt: input.now, publishedById: input.publisherUserId,
  } });
  await tx.knowledgeDocument.update({ where: { id: current.id }, data: { currentVersionId: input.version.id } });
});
```

`retireAtomic` must set the current version to `RETIRED` and clear `currentVersionId` in the same transaction. `listVisibleCurrent` and `listSearchableChunks` must filter `status = CURRENT`, `effectiveAt <= now OR null`, and `expiresAt > now OR null` at the database query.

`findCurrentDetail` must join the current version and return its `contentText`; the service applies employee visibility before returning that detail. `createVersion` must run in a transaction, read the maximum existing `versionNumber` for the document, create exactly `max + 1`, and return the new draft. A retry must return a conflict instead of overwriting an existing version.

`createDraft` must create the document, version, visibility rows, and attachment row in one transaction. `transitionVersion` must use `updateMany({ where: { id, status: { in: allowedFrom } } })` and return `count === 1`. `reviewAtomic` must insert the review and conditionally transition `PENDING_REVIEW` to `APPROVED` or `REJECTED` in one transaction; if the conditional update count is zero, the transaction throws and no duplicate review is retained.

- [ ] **Step 6: Test transaction ordering with a Prisma fake**

`prismaKnowledgeRepository.test.ts` must record transaction operations and assert this exact order:

```ts
const operations: string[] = [];
const tx = {
  knowledgeDocument: {
    findUnique: async () => ({ id: 'doc-1', currentVersionId: 'old-version' }),
    update: async ({ data }: any) => { operations.push(`point-current:${data.currentVersionId}`); },
  },
  knowledgeVersion: {
    findUnique: async () => ({ id: 'new-version', status: 'APPROVED' }),
    update: async ({ where, data }: any) => {
      operations.push(data.status === 'RETIRED' ? `retire:${where.id}` : `activate:${where.id}`);
    },
  },
  knowledgeChunk: {
    deleteMany: async ({ where }: any) => { operations.push(`delete-chunks:${where.versionId}`); },
    createMany: async ({ data }: any) => { operations.push(`create-chunks:${data.length}`); },
  },
};
const prisma = { $transaction: async (callback: any) => callback(tx) } as any;
const repository = createPrismaKnowledgeRepository(prisma);
await repository.publishAtomic({
  version: { id: 'new-version', documentId: 'doc-1', versionNumber: 2, status: 'APPROVED', sourceFileName: 'v2.md', checksum: 'hash', contentText: '# v2' },
  publisherUserId: 'user-publisher',
  chunks: [{ ordinal: 0, heading: 'v2', content: 'one', searchText: 'one' }, { ordinal: 1, content: 'two', searchText: 'two' }],
  now: new Date('2026-07-10T00:00:00.000Z'),
});
assert.deepEqual(operations, [
  'retire:old-version',
  'delete-chunks:new-version',
  'create-chunks:2',
  'activate:new-version',
  'point-current:new-version',
]);
```

Create a second fake where `knowledgeChunk.createMany` throws `new Error('chunk failure')`, call `publishAtomic`, and assert `operations` does not contain an entry beginning with `point-current:`.

- [ ] **Step 7: Run storage, repository, runtime, and Prisma checks**

Run:

```bash
pnpm exec tsx server/services/enablement/knowledgeFileStore.test.ts
pnpm exec tsx server/services/enablement/prismaKnowledgeRepository.test.ts
pnpm exec tsx server/config/runtime.test.ts
pnpm exec prisma validate
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit persistence**

```bash
git add .gitignore .env.example server/config/runtime.ts server/config/runtime.test.ts server/services/enablement/knowledgeFileStore.ts server/services/enablement/knowledgeFileStore.test.ts server/services/enablement/prismaKnowledgeRepository.ts server/services/enablement/prismaKnowledgeRepository.test.ts
git commit -m "feat: persist private enablement knowledge"
```

---

### Task 7: Mount Authenticated Knowledge Routes

**Files:**
- Create: `server/routes/enablementKnowledgeRoutes.ts`
- Modify: `server/index.ts:1-60`
- Modify: `server/index.ts:118-140`
- Test: `server/routes/enablementKnowledgeRoutes.test.ts`

**Interfaces:**
- Consumes: `createKnowledgeService`, `createRequireAuth`, current authenticated user, and permission constants.
- Produces: `/api/enablement/knowledge` JSON endpoints.
- Produces: no public source-file URL.

- [ ] **Step 1: Write the failing route contract test**

```ts
// server/routes/enablementKnowledgeRoutes.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'server/routes/enablementKnowledgeRoutes.ts'), 'utf8');
const server = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');

assert.match(route, /router\.get\('\/'/);
assert.match(route, /router\.get\('\/search'/);
assert.match(route, /router\.get\('\/review-queue'/);
assert.match(route, /router\.get\('\/publication-queue'/);
assert.match(route, /router\.post\('\/drafts'/);
assert.match(route, /router\.post\('\/:documentId\/versions'/);
assert.match(route, /router\.post\('\/versions\/:versionId\/submit-review'/);
assert.match(route, /router\.post\('\/versions\/:versionId\/review'/);
assert.match(route, /router\.post\('\/versions\/:versionId\/publish'/);
assert.match(route, /router\.post\('\/:documentId\/retire'/);
assert.match(server, /app\.use\('\/api\/enablement\/knowledge'/);
assert.doesNotMatch(route, /express\.static|\/uploads\//);
```

- [ ] **Step 2: Run the route test and verify failure**

Run: `pnpm exec tsx server/routes/enablementKnowledgeRoutes.test.ts`

Expected: FAIL because the route module is absent.

- [ ] **Step 3: Implement a router factory with explicit middleware**

```ts
// server/routes/enablementKnowledgeRoutes.ts
import express from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { KnowledgeService } from '../services/enablement/knowledgeService';

export function createEnablementKnowledgeRouter(deps: {
  knowledgeService: KnowledgeService;
  requireRead: express.RequestHandler;
  requireReview: express.RequestHandler;
  requirePublish: express.RequestHandler;
}) {
  const router = express.Router();
  const statusFor = (code: number, successStatus = 200) => (
    code === 0 ? successStatus : [400, 403, 404, 409].includes(code) ? code : 400
  );
  router.get('/', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.listCurrent(req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/search', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.searchCurrent(String(req.query.query || '').trim(), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.get('/review-queue', deps.requireReview, async (req: AuthenticatedRequest, res) => {
    res.json(await deps.knowledgeService.listReviewQueue(req.currentUser!));
  });
  router.get('/publication-queue', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    res.json(await deps.knowledgeService.listPublicationQueue(req.currentUser!));
  });
  router.get('/:documentId', deps.requireRead, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.getCurrent(String(req.params.documentId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/drafts', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.createDraft(req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });
  router.post('/:documentId/versions', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.createVersion(String(req.params.documentId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code, 201)).json(result);
  });
  router.post('/versions/:versionId/submit-review', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.submitForReview(String(req.params.versionId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/versions/:versionId/review', deps.requireReview, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.review(String(req.params.versionId), req.body || {}, req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/versions/:versionId/publish', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.publish(String(req.params.versionId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  router.post('/:documentId/retire', deps.requirePublish, async (req: AuthenticatedRequest, res) => {
    const result = await deps.knowledgeService.retire(String(req.params.documentId), req.currentUser!);
    res.status(statusFor(result.code)).json(result);
  });
  return router;
}
```

Keep `GET /:documentId` after `/search`, `/review-queue`, and `/publication-queue`, but before dynamic mutation routes. Queue responses use `KnowledgeWorkflowItemDto`, which includes the pending or approved source text so reviewers and publishers can inspect the exact version before acting.

- [ ] **Step 4: Compose the domain in `server/index.ts`**

Create these middlewares and mount one router:

```ts
const requireEnablementRead = createRequireAuth(authService, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE);
const requireEnablementReview = createRequireAuth(authService, PERMISSION_KEYS.ENABLEMENT_REVIEW, 'write');
const requireEnablementPublish = createRequireAuth(authService, PERMISSION_KEYS.ENABLEMENT_PUBLISH, 'write');

const knowledgeRepository = createPrismaKnowledgeRepository(prisma);
const knowledgeFileStore = createKnowledgeFileStore(getEnablementPrivateStorageDir());
const knowledgeService = createKnowledgeService({
  repository: knowledgeRepository,
  fileStore: knowledgeFileStore,
  searchProvider: createKeywordKnowledgeSearchProvider(),
});

app.use('/api/enablement/knowledge', createEnablementKnowledgeRouter({
  knowledgeService,
  requireRead: requireEnablementRead,
  requireReview: requireEnablementReview,
  requirePublish: requireEnablementPublish,
}));
```

Pass `fileStore` through the Task 5 dependency type as shown there. `createDraft` writes the source before repository creation and passes attachment metadata into `repository.createDraft`. If repository creation fails, retain the private file for administrator investigation and log the storage key without exposing it to employees.

- [ ] **Step 5: Run route, auth, lifecycle, and build checks**

Run:

```bash
pnpm exec tsx server/routes/enablementKnowledgeRoutes.test.ts
pnpm exec tsx server/middleware/auth.test.ts
pnpm exec tsx server/services/enablement/knowledgeService.test.ts
pnpm build
```

Expected: tests exit 0; TypeScript and Vite build succeed.

- [ ] **Step 6: Commit the API boundary**

```bash
git add server/routes/enablementKnowledgeRoutes.ts server/index.ts server/services/enablement/knowledgeService.ts server/services/enablement/knowledgeService.test.ts
git commit -m "feat: expose enablement knowledge api"
```

---

### Task 8: Build the Knowledge and Publishing UI

**Files:**
- Create: `src/api/enablementApi.ts`
- Modify: `src/api/index.ts:1-30`
- Create: `src/store/useEnablementStore.ts`
- Create: `src/pages/Enablement/index.tsx`
- Create: `src/pages/Enablement/KnowledgeCenter.tsx`
- Create: `src/pages/Enablement/PublishingCenter.tsx`
- Modify: `src/App.tsx:1-160`
- Modify: `src/layouts/Sidebar.tsx:1-210`
- Test: `src/api/enablementApi.test.ts`
- Test: `src/api/enablementModuleStatic.test.ts`

**Interfaces:**
- Consumes: Task 7 endpoints and Task 1 permission constants.
- Produces: `enablementApi.listKnowledge`, `searchKnowledge`, `getKnowledge`, `createDraft`, `createVersion`, `submitForReview`, `reviewVersion`, `publishVersion`, `retireDocument`, `listReviewQueue`, and `listPublicationQueue`.
- Produces: `/enablement?tab=knowledge` and `/enablement?tab=publishing`.

- [ ] **Step 1: Write failing client and module tests**

```ts
// src/api/enablementApi.test.ts
import assert from 'node:assert/strict';
import { enablementApi } from './enablementApi';

const calls: Array<{ url: string; method: string }> = [];
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => 'token', removeItem() {} }, configurable: true });
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(url), method: init?.method || 'GET' });
  return new Response(JSON.stringify({ code: 0, data: [], message: 'success' }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as any;

await enablementApi.searchKnowledge('公司');
await enablementApi.submitForReview('version-1');
assert.match(calls[0].url, /\/api\/enablement\/knowledge\/search\?query=/);
assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST']);
```

```ts
// src/api/enablementModuleStatic.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
const sidebar = readFileSync(join(process.cwd(), 'src/layouts/Sidebar.tsx'), 'utf8');
const page = readFileSync(join(process.cwd(), 'src/pages/Enablement/index.tsx'), 'utf8');
const knowledge = readFileSync(join(process.cwd(), 'src/pages/Enablement/KnowledgeCenter.tsx'), 'utf8');
const publishing = readFileSync(join(process.cwd(), 'src/pages/Enablement/PublishingCenter.tsx'), 'utf8');
assert.match(app, /ROUTES\.ENABLEMENT/);
assert.match(app, /PERMISSION_KEYS\.ENABLEMENT/);
assert.match(sidebar, /label:\s*'赋能中台'/);
assert.match(page, /企业知识/);
assert.match(page, /发布管理/);
assert.match(knowledge, /搜索公司知识/);
assert.match(publishing, /导入Markdown/);
assert.match(publishing, /提交审核/);
assert.match(publishing, /正式发布/);
```

- [ ] **Step 2: Run tests and observe missing modules**

Run:

```bash
pnpm exec tsx src/api/enablementApi.test.ts
pnpm exec tsx src/api/enablementModuleStatic.test.ts
```

Expected: FAIL because the API and pages do not exist.

- [ ] **Step 3: Implement the typed client without local fallback**

```ts
// src/api/enablementApi.ts
import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type { CreateKnowledgeDraftInput, CreateKnowledgeVersionInput, KnowledgeDocumentDetailDto, KnowledgeDocumentDto, KnowledgeSearchHit, KnowledgeWorkflowItemDto } from '../types/enablement';

const base = '/enablement/knowledge';
export const enablementApi = {
  listKnowledge(): Promise<ApiResponse<KnowledgeDocumentDto[]>> {
    return backendRequest(base);
  },
  searchKnowledge(query: string): Promise<ApiResponse<KnowledgeSearchHit[]>> {
    return backendRequest(`${base}/search?query=${encodeURIComponent(query)}`);
  },
  getKnowledge(id: string): Promise<ApiResponse<KnowledgeDocumentDetailDto>> {
    return backendRequest(`${base}/${encodeURIComponent(id)}`);
  },
  createDraft(input: CreateKnowledgeDraftInput) {
    return backendRequest(`${base}/drafts`, { method: 'POST', body: JSON.stringify(input) });
  },
  createVersion(documentId: string, input: CreateKnowledgeVersionInput) {
    return backendRequest(`${base}/${encodeURIComponent(documentId)}/versions`, { method: 'POST', body: JSON.stringify(input) });
  },
  submitForReview(versionId: string) {
    return backendRequest(`${base}/versions/${encodeURIComponent(versionId)}/submit-review`, { method: 'POST' });
  },
  reviewVersion(versionId: string, input: { decision: 'APPROVE' | 'REJECT'; comment?: string }) {
    return backendRequest(`${base}/versions/${encodeURIComponent(versionId)}/review`, { method: 'POST', body: JSON.stringify(input) });
  },
  publishVersion(versionId: string) {
    return backendRequest(`${base}/versions/${encodeURIComponent(versionId)}/publish`, { method: 'POST' });
  },
  retireDocument(documentId: string) {
    return backendRequest(`${base}/${encodeURIComponent(documentId)}/retire`, { method: 'POST' });
  },
  listReviewQueue(): Promise<ApiResponse<KnowledgeWorkflowItemDto[]>> {
    return backendRequest(`${base}/review-queue`);
  },
  listPublicationQueue(): Promise<ApiResponse<KnowledgeWorkflowItemDto[]>> {
    return backendRequest(`${base}/publication-queue`);
  },
};
```

Export it from `src/api/index.ts`.

- [ ] **Step 4: Implement one focused Zustand store**

```ts
// src/store/useEnablementStore.ts
import { create } from 'zustand';
import { enablementApi } from '../api';
import type { KnowledgeDocumentDto, KnowledgeSearchHit, KnowledgeWorkflowItemDto } from '../types/enablement';

type State = {
  knowledge: KnowledgeDocumentDto[];
  searchHits: KnowledgeSearchHit[];
  reviewQueue: KnowledgeWorkflowItemDto[];
  publicationQueue: KnowledgeWorkflowItemDto[];
  loading: boolean;
  error: string | null;
  loadKnowledge(): Promise<void>;
  searchKnowledge(query: string): Promise<void>;
  loadReviewQueue(): Promise<void>;
  loadPublicationQueue(): Promise<void>;
  reset(): void;
};

const useEnablementStore = create<State>((set) => ({
  knowledge: [], searchHits: [], reviewQueue: [], publicationQueue: [], loading: false, error: null,
  async loadKnowledge() {
    set({ loading: true, error: null });
    const result = await enablementApi.listKnowledge();
    set(result.code === 0 ? { knowledge: result.data, loading: false } : { error: result.message, loading: false });
  },
  async searchKnowledge(query) {
    set({ loading: true, error: null });
    const result = await enablementApi.searchKnowledge(query);
    set(result.code === 0 ? { searchHits: result.data, loading: false } : { error: result.message, loading: false });
  },
  async loadReviewQueue() {
    set({ loading: true, error: null });
    const result = await enablementApi.listReviewQueue();
    set(result.code === 0 ? { reviewQueue: result.data, loading: false } : { error: result.message, loading: false });
  },
  async loadPublicationQueue() {
    set({ loading: true, error: null });
    const result = await enablementApi.listPublicationQueue();
    set(result.code === 0 ? { publicationQueue: result.data, loading: false } : { error: result.message, loading: false });
  },
  reset: () => set({ knowledge: [], searchHits: [], reviewQueue: [], publicationQueue: [], loading: false, error: null }),
}));
export default useEnablementStore;
```

- [ ] **Step 5: Build the enablement shell and knowledge view**

`src/pages/Enablement/index.tsx` must read `tab` from search params, render tabs only when the user has the matching permission, and default to `knowledge`. `KnowledgeCenter.tsx` must provide:

```tsx
<TextField label="搜索公司知识" value={query} onChange={(event) => setQuery(event.target.value)} />
<Button onClick={() => searchKnowledge(query)}>搜索</Button>
```

Render title, category, summary, current version, and effective/update time for browse results; render title, heading, excerpt, score, and version for search hits. Do not render raw private storage keys.

- [ ] **Step 6: Build the publishing workflow**

`PublishingCenter.tsx` must use a browser `File` reader for `.md` files and fill a draft form with title, category, owner department, sensitivity, visibility, effective date, and optional source path. Submit `markdown: await file.text()` through `enablementApi.createDraft`.

Display review actions from `reviewQueue` and draft/publish/retire actions from `publicationQueue`. Add an “上传新版本” action that calls `createVersion(document.id, input)` without editing the existing immutable version. Display allowed actions from status and permission:

```ts
const canSubmit = ['DRAFT', 'REJECTED'].includes(version.status);
const canReview = version.status === 'PENDING_REVIEW' && hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_REVIEW, 'write');
const canPublish = version.status === 'APPROVED' && hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_PUBLISH, 'write');
```

Server responses remain authoritative; after every action reload the queue and knowledge list.

- [ ] **Step 7: Add protected route and sidebar entry**

Add lazy import and protected route in `src/App.tsx`:

```tsx
const Enablement = React.lazy(() => import('./pages/Enablement'));

<Route element={<ProtectedRoute permissionKey={PERMISSION_KEYS.ENABLEMENT} />}>
  <Route path={ROUTES.ENABLEMENT} element={<Suspense fallback={<PageLoader />}><Enablement /></Suspense>} />
</Route>
```

Add a top-level sidebar item using `SchoolIcon`:

```tsx
{ label: '赋能中台', icon: <SchoolIcon />, path: ROUTES.ENABLEMENT, permissionKey: PERMISSION_KEYS.ENABLEMENT },
```

- [ ] **Step 8: Run focused UI/API tests and build**

Run:

```bash
pnpm exec tsx src/api/enablementApi.test.ts
pnpm exec tsx src/api/enablementModuleStatic.test.ts
pnpm exec tsx src/api/enablementPermissionModel.test.ts
pnpm build
```

Expected: all tests exit 0; build succeeds.

- [ ] **Step 9: Commit the frontend slice**

```bash
git add src/api/enablementApi.ts src/api/index.ts src/store/useEnablementStore.ts src/pages/Enablement src/App.tsx src/layouts/Sidebar.tsx src/api/enablementApi.test.ts src/api/enablementModuleStatic.test.ts
git commit -m "feat: add enablement knowledge workspace"
```

---

### Task 9: Verify the Increment End to End and Document It

**Files:**
- Modify: `docs/jixiang-os-project-knowledge-base.md`
- No production source changes unless verification identifies a defect; defects receive their own failing test before a fix.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified increment gate and updated project knowledge.

- [ ] **Step 1: Apply and verify the migration in the local database**

Run:

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
```

Expected: migration `20260710010000_enablement_knowledge_foundation` is applied and schema is up to date.

- [ ] **Step 2: Run every new focused test**

Run:

```bash
pnpm exec tsx src/api/enablementPermissionModel.test.ts
pnpm exec tsx server/services/enablement/knowledgeSchema.test.ts
pnpm exec tsx server/services/enablement/knowledgePolicy.test.ts
pnpm exec tsx server/services/enablement/knowledgeSearchProvider.test.ts
pnpm exec tsx server/services/enablement/knowledgeService.test.ts
pnpm exec tsx server/services/enablement/knowledgeFileStore.test.ts
pnpm exec tsx server/services/enablement/prismaKnowledgeRepository.test.ts
pnpm exec tsx server/routes/enablementKnowledgeRoutes.test.ts
pnpm exec tsx src/api/enablementApi.test.ts
pnpm exec tsx src/api/enablementModuleStatic.test.ts
```

Expected: every command exits 0.

- [ ] **Step 3: Run full regression and production build**

Run:

```bash
pnpm test
pnpm build
```

Expected: all test files pass and Vite emits a successful production build.

- [ ] **Step 4: Browser-verify four permission stories**

Start the local environment using the repository's local-start workflow, then verify:

1. Employee with knowledge-read permission can open `/enablement`, browse, search, and view current knowledge.
2. Department manager with review permission sees only the queue for departments where `managerId` matches the account and can approve or reject.
3. Publisher can import Markdown, submit, publish, and retire.
4. Employee without sensitive permission cannot see finance-sensitive knowledge even when visibility includes all employees.

Expected: no private storage key or unauthenticated file URL appears in the browser or network responses.

- [ ] **Step 5: Verify immutable version behavior**

Publish version 1, import and publish version 2, then retire the document. Confirm:

- Version 1 remains in database history with its review.
- Version 2 becomes the sole current version before retirement.
- Retirement clears current browse/search.
- Neither publish nor retirement deletes chunks, reviews, attachments, or versions.

- [ ] **Step 6: Update project knowledge**

Append a section to `docs/jixiang-os-project-knowledge-base.md` documenting:

```markdown
## 赋能中台：企业知识底座

- 极享OS内新增独立赋能中台域，不使用localStorage或通用BusinessRecord保存权威知识。
- 第一增量支持Markdown导入、部门审核、管理员发布、不可变版本、权限浏览和关键词搜索。
- 只有当前有效版本进入员工搜索；下线不删除历史。
- 私有知识源文件不通过公开uploads目录暴露。
- 课程、新人路径、考试、任务和AI导师将在后续增量中接入该底座。
```

- [ ] **Step 7: Commit verification documentation**

```bash
git add docs/jixiang-os-project-knowledge-base.md
git commit -m "docs: record enablement knowledge foundation"
```

## Increment Completion Checklist

- [ ] All new tests pass individually.
- [ ] Full `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] Migration status is current.
- [ ] Only authorized current knowledge is visible and searchable.
- [ ] Department review and publisher actions are independently enforced.
- [ ] Publish swap and retirement preserve history.
- [ ] Private Markdown is not exposed under `/uploads`.
- [ ] No enablement state is stored in localStorage, `AppStorage`, or `BusinessRecord`.
- [ ] Existing AI Assistant behavior and tests remain unchanged.
- [ ] Unrelated worktree changes remain unmodified and uncommitted.
