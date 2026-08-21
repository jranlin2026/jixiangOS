ALTER TABLE `employee_tasks`
  ADD COLUMN `sourceKey` VARCHAR(180) NULL,
  ADD COLUMN `taskType` VARCHAR(32) NOT NULL DEFAULT 'ACTION',
  ADD COLUMN `priority` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN `businessModule` VARCHAR(40) NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN `sourceRoute` VARCHAR(500) NULL,
  ADD COLUMN `sourceLabel` VARCHAR(120) NULL,
  ADD COLUMN `startedAt` DATETIME(3) NULL,
  ADD COLUMN `canceledAt` DATETIME(3) NULL,
  ADD COLUMN `canceledById` VARCHAR(64) NULL,
  ADD COLUMN `canceledReason` VARCHAR(500) NULL,
  ADD COLUMN `collaboratorIds` JSON NULL,
  ADD COLUMN `estimatedMinutes` INTEGER NULL,
  ADD COLUMN `qualityScore` INTEGER NULL,
  ADD COLUMN `qualityComment` VARCHAR(500) NULL,
  ADD COLUMN `remindedAt` DATETIME(3) NULL,
  ADD COLUMN `lastOverdueNotifiedAt` DATETIME(3) NULL,
  ADD COLUMN `sourceVersion` VARCHAR(80) NULL;

UPDATE `employee_tasks`
SET `sourceKey` = CONCAT('legacy:employee_task:', `id`)
WHERE `sourceKey` IS NULL;

CREATE UNIQUE INDEX `employee_tasks_source_key_key`
  ON `employee_tasks`(`sourceKey`);

CREATE TABLE `task_activities` (
  `id` VARCHAR(64) NOT NULL,
  `taskId` VARCHAR(64) NOT NULL,
  `action` VARCHAR(40) NOT NULL,
  `actorId` VARCHAR(64) NULL,
  `actorName` VARCHAR(100) NULL,
  `fromStatus` VARCHAR(24) NULL,
  `toStatus` VARCHAR(24) NULL,
  `comment` VARCHAR(500) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `task_activities_taskId_createdAt_idx`(`taskId`, `createdAt`),
  INDEX `task_activities_actorId_createdAt_idx`(`actorId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `task_activities_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `employee_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
