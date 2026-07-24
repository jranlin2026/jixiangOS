CREATE TABLE `business_import_batches` (
  `id` VARCHAR(64) NOT NULL,
  `importType` VARCHAR(32) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `actorId` VARCHAR(64) NOT NULL,
  `actorName` VARCHAR(100) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `rowsHash` CHAR(64) NOT NULL,
  `sourceFileName` VARCHAR(255) NULL,
  `rows` JSON NOT NULL,
  `totalCount` INTEGER NOT NULL,
  `readyCount` INTEGER NOT NULL,
  `warningCount` INTEGER NOT NULL,
  `blockedCount` INTEGER NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `business_import_batches_tokenHash_key` (`tokenHash`),
  INDEX `business_import_batches_actorId_importType_expiresAt_idx` (`actorId`, `importType`, `expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `business_import_jobs` (
  `id` VARCHAR(64) NOT NULL,
  `batchId` VARCHAR(64) NOT NULL,
  `importType` VARCHAR(32) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `actorId` VARCHAR(64) NOT NULL,
  `actorName` VARCHAR(100) NOT NULL,
  `rowsHash` CHAR(64) NOT NULL,
  `sourceFileName` VARCHAR(255) NOT NULL,
  `rows` JSON NOT NULL,
  `idempotencyKey` VARCHAR(128) NOT NULL,
  `totalCount` INTEGER NOT NULL,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `business_import_jobs_actorId_importType_idempotencyKey_key` (`actorId`, `importType`, `idempotencyKey`),
  INDEX `business_import_jobs_importType_status_createdAt_idx` (`importType`, `status`, `createdAt`),
  CONSTRAINT `business_import_jobs_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `business_import_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `business_import_number_reservations` (
  `id` VARCHAR(64) NOT NULL,
  `importType` VARCHAR(32) NOT NULL,
  `normalizedNumber` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(64) NOT NULL,
  `jobId` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `business_import_num_type_number_uq` (`importType`, `normalizedNumber`),
  INDEX `business_import_num_job_idx` (`jobId`),
  CONSTRAINT `business_import_number_reservations_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `business_import_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `business_import_number_reservations_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `business_import_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
