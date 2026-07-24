CREATE TABLE `business_export_audits` (
  `id` VARCHAR(64) NOT NULL,
  `module` VARCHAR(40) NOT NULL,
  `actorId` VARCHAR(64) NOT NULL,
  `actorName` VARCHAR(100) NOT NULL,
  `reason` TEXT NOT NULL,
  `filtersSnapshot` JSON NOT NULL,
  `columnMode` VARCHAR(20) NOT NULL,
  `columns` JSON NOT NULL,
  `summaryRowCount` INTEGER NOT NULL,
  `detailRowCount` INTEGER NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `business_export_audits_module_createdAt_idx`(`module`, `createdAt`),
  INDEX `business_export_audits_actorId_createdAt_idx`(`actorId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
