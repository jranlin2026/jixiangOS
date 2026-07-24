ALTER TABLE `business_import_jobs`
  ADD COLUMN `successCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `leaseOwner` VARCHAR(64) NULL,
  ADD COLUMN `leaseEpoch` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `heartbeatAt` DATETIME(3) NULL,
  ADD COLUMN `errorMessage` TEXT NULL;

CREATE INDEX `business_import_jobs_status_leaseExpiresAt_idx`
  ON `business_import_jobs`(`status`, `leaseExpiresAt`);
