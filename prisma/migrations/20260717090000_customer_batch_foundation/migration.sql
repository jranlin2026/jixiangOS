-- Customer batch foundation. Customers remain BusinessRecord JSON rows; the
-- customerId columns below are opaque identifiers and intentionally have no
-- foreign key to a nonexistent customers table.

CREATE TABLE `customer_batch_prechecks` (
  `id` VARCHAR(64) NOT NULL,
  `actorId` VARCHAR(64) NOT NULL,
  `handlerKey` VARCHAR(80) NOT NULL,
  `operation` VARCHAR(80) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `selectionHash` CHAR(64) NOT NULL,
  `inputHash` CHAR(64) NOT NULL,
  `guardManifest` JSON NOT NULL,
  `fileHash` CHAR(64) NULL,
  `normalizedRowsHash` CHAR(64) NULL,
  `customerVersionManifest` JSON NOT NULL,
  `selectedCustomerIds` JSON NOT NULL,
  `filterSnapshot` JSON NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `consumedResultType` VARCHAR(64) NULL,
  `consumedResultId` VARCHAR(64) NULL,
  `consumedIdempotencyKey` VARCHAR(128) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `customer_batch_prechecks_tokenHash_key`(`tokenHash`),
  INDEX `customer_batch_prechecks_actorId_operation_expiresAt_idx`(`actorId`, `operation`, `expiresAt`),
  INDEX `customer_batch_prechecks_consumedResultType_consumedResultId_idx`(`consumedResultType`, `consumedResultId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_batch_jobs` (
  `id` VARCHAR(64) NOT NULL,
  `handlerKey` VARCHAR(80) NOT NULL,
  `operation` VARCHAR(80) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `selectionMode` VARCHAR(32) NOT NULL,
  `selectedCustomerIds` JSON NOT NULL,
  `filterSnapshot` JSON NULL,
  `input` JSON NOT NULL,
  `inputHash` CHAR(64) NOT NULL,
  `idempotencyFingerprint` CHAR(64) NOT NULL,
  `reason` TEXT NOT NULL,
  `idempotencyKey` VARCHAR(128) NOT NULL,
  `actorId` VARCHAR(64) NOT NULL,
  `actorName` VARCHAR(100) NOT NULL,
  `actorDepartmentId` VARCHAR(64) NULL,
  `frozenCustomerCount` INTEGER NOT NULL,
  `totalCount` INTEGER NOT NULL DEFAULT 0,
  `successCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `skippedCount` INTEGER NOT NULL DEFAULT 0,
  `cancelledCount` INTEGER NOT NULL DEFAULT 0,
  `leaseOwner` VARCHAR(64) NULL,
  `leaseEpoch` INTEGER NOT NULL DEFAULT 0,
  `leaseExpiresAt` DATETIME(3) NULL,
  `heartbeatAt` DATETIME(3) NULL,
  `cursor` INTEGER NOT NULL DEFAULT 0,
  `cancelRequestedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `attemptCount` INTEGER NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `retryOfJobId` VARCHAR(64) NULL,

  UNIQUE INDEX `customer_batch_jobs_actorId_handlerKey_operation_idempotency_key`(`actorId`, `handlerKey`, `operation`, `idempotencyKey`),
  INDEX `customer_batch_jobs_status_leaseExpiresAt_idx`(`status`, `leaseExpiresAt`),
  INDEX `customer_batch_jobs_retryOfJobId_idx`(`retryOfJobId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_batch_job_items` (
  `id` VARCHAR(64) NOT NULL,
  `jobId` VARCHAR(64) NOT NULL,
  `targetKey` VARCHAR(120) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `errorCode` VARCHAR(64) NULL,
  `errorMessage` TEXT NULL,
  `expectedUpdatedAt` DATETIME(3) NULL,
  `beforeHash` CHAR(64) NULL,
  `afterHash` CHAR(64) NULL,
  `beforeSnapshot` JSON NULL,
  `afterSnapshot` JSON NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `attemptCount` INTEGER NOT NULL DEFAULT 0,
  `retryable` BOOLEAN NOT NULL DEFAULT false,
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,

  CONSTRAINT `customer_batch_job_items_target_key_nonempty_chk`
    CHECK (CHAR_LENGTH(TRIM(`targetKey`)) > 0),
  UNIQUE INDEX `customer_batch_job_items_idempotencyKey_key`(`idempotencyKey`),
  UNIQUE INDEX `customer_batch_job_item_target_unique`(`jobId`, `targetKey`),
  INDEX `customer_batch_job_items_jobId_status_idx`(`jobId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_audit_events` (
  `id` VARCHAR(64) NOT NULL,
  `eventSequence` BIGINT NOT NULL AUTO_INCREMENT,
  `customerId` VARCHAR(80) NOT NULL,
  `batchJobId` VARCHAR(64) NULL,
  `operation` VARCHAR(80) NOT NULL,
  `actorId` VARCHAR(64) NOT NULL,
  `actorName` VARCHAR(100) NOT NULL,
  `reason` TEXT NULL,
  `inputHash` CHAR(64) NULL,
  `beforeSnapshot` JSON NULL,
  `afterSnapshot` JSON NULL,
  `result` VARCHAR(32) NOT NULL,
  `requestId` VARCHAR(128) NULL,
  `idempotencyKey` VARCHAR(191) NULL,
  `ip` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `customer_audit_events_eventSequence_key`(`eventSequence`),
  INDEX `customer_audit_events_customerId_eventSequence_idx`(`customerId`, `eventSequence`),
  INDEX `customer_audit_events_batchJobId_createdAt_idx`(`batchJobId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `contact_identities` (
  `id` VARCHAR(64) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `normalizedHash` CHAR(64) NOT NULL,
  `hashKeyVersion` INTEGER NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `encryptedNormalizedValue` TEXT NOT NULL,
  `canonicalCustomerId` VARCHAR(80) NULL,
  `conflictReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `contact_identities_type_normalizedHash_key`(`type`, `normalizedHash`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `contact_identity_links` (
  `id` VARCHAR(64) NOT NULL,
  `identityId` VARCHAR(64) NOT NULL,
  `entityType` VARCHAR(32) NOT NULL,
  `entityId` VARCHAR(80) NOT NULL,
  `linkStatus` VARCHAR(32) NOT NULL,
  `source` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endedAt` DATETIME(3) NULL,

  UNIQUE INDEX `contact_identity_links_identityId_entityType_entityId_key`(`identityId`, `entityType`, `entityId`),
  INDEX `contact_identity_links_entityType_entityId_linkStatus_idx`(`entityType`, `entityId`, `linkStatus`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_duplicate_groups` (
  `id` VARCHAR(64) NOT NULL,
  `groupKey` CHAR(64) NOT NULL,
  `rule` VARCHAR(80) NOT NULL,
  `confidence` VARCHAR(32) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `customerIds` JSON NOT NULL,
  `contactIdentityId` VARCHAR(64) NULL,
  `sourceJobId` VARCHAR(64) NULL,
  `createdById` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  `mergeLedgerId` VARCHAR(64) NULL,

  UNIQUE INDEX `customer_duplicate_groups_groupKey_key`(`groupKey`),
  INDEX `customer_duplicate_groups_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `customer_duplicate_groups_contactIdentityId_idx`(`contactIdentityId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_batch_jobs`
  ADD CONSTRAINT `customer_batch_jobs_retryOfJobId_fkey`
  FOREIGN KEY (`retryOfJobId`) REFERENCES `customer_batch_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `customer_batch_job_items`
  ADD CONSTRAINT `customer_batch_job_items_jobId_fkey`
  FOREIGN KEY (`jobId`) REFERENCES `customer_batch_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `contact_identity_links`
  ADD CONSTRAINT `contact_identity_links_identityId_fkey`
  FOREIGN KEY (`identityId`) REFERENCES `contact_identities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
