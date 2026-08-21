CREATE TABLE `workbench_scheduler_leases` (
  `leaseKey` VARCHAR(80) NOT NULL,
  `leaseEpoch` INTEGER NOT NULL DEFAULT 0,
  `ownerToken` VARCHAR(160) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `workbench_scheduler_leases_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`leaseKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workbench_scheduler_runs` (
  `id` VARCHAR(64) NOT NULL,
  `leaseKey` VARCHAR(80) NOT NULL,
  `ownerToken` VARCHAR(160) NOT NULL,
  `leaseEpoch` INTEGER NOT NULL,
  `jobType` VARCHAR(40) NOT NULL,
  `businessDate` VARCHAR(10) NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
  `startedAt` DATETIME(3) NOT NULL,
  `finishedAt` DATETIME(3) NULL,
  `successCount` INTEGER NOT NULL DEFAULT 0,
  `skippedCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `failureSummary` JSON NULL,
  `cursors` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `workbench_scheduler_runs_jobType_startedAt_idx`(`jobType`, `startedAt`),
  INDEX `workbench_scheduler_runs_leaseKey_status_leaseEpoch_idx`(`leaseKey`, `status`, `leaseEpoch`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
