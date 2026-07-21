CREATE TABLE `system_installations` (
  `id` VARCHAR(32) NOT NULL DEFAULT 'primary',
  `installationId` VARCHAR(64) NOT NULL,
  `state` ENUM('UNINITIALIZED', 'INITIALIZING', 'ACTIVE', 'RESETTING', 'FAILED') NOT NULL DEFAULT 'UNINITIALIZED',
  `setupVersion` INTEGER NOT NULL DEFAULT 1,
  `companyName` VARCHAR(100) NULL,
  `initializedAt` DATETIME(3) NULL,
  `lastError` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `system_installations_installationId_key`(`installationId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
