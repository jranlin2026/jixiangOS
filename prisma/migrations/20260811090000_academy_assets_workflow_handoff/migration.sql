ALTER TABLE `academy_session_tasks`
  ADD COLUMN `assigneeUserId` VARCHAR(64) NULL,
  ADD COLUMN `assigneeUserName` VARCHAR(100) NULL,
  ADD COLUMN `collaboratorNames` JSON NULL,
  ADD COLUMN `dueAt` DATETIME(3) NULL,
  ADD COLUMN `acceptanceCriteria` TEXT NULL,
  ADD COLUMN `submissionNote` TEXT NULL,
  ADD COLUMN `submittedAt` DATETIME(3) NULL,
  ADD COLUMN `submittedById` VARCHAR(64) NULL,
  ADD COLUMN `submittedByName` VARCHAR(100) NULL,
  ADD COLUMN `reviewNote` TEXT NULL,
  ADD COLUMN `reviewedAt` DATETIME(3) NULL,
  ADD COLUMN `reviewedById` VARCHAR(64) NULL,
  ADD COLUMN `reviewedByName` VARCHAR(100) NULL;

CREATE INDEX `academy_session_tasks_assigneeUserId_status_dueAt_idx`
  ON `academy_session_tasks`(`assigneeUserId`, `status`, `dueAt`);

ALTER TABLE `academy_engagements`
  ADD COLUMN `nextFollowUpAt` DATETIME(3) NULL,
  ADD COLUMN `orderId` VARCHAR(64) NULL,
  ADD COLUMN `orderNo` VARCHAR(100) NULL,
  ADD COLUMN `handoffStatus` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `handedOffAt` DATETIME(3) NULL,
  ADD COLUMN `handedOffById` VARCHAR(64) NULL,
  ADD COLUMN `handedOffByName` VARCHAR(100) NULL;

CREATE INDEX `academy_engagements_orderId_idx`
  ON `academy_engagements`(`orderId`);

CREATE INDEX `academy_engagements_handoffStatus_updatedAt_idx`
  ON `academy_engagements`(`handoffStatus`, `updatedAt`);
