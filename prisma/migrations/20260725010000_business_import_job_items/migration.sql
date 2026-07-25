CREATE TABLE `business_import_job_items` (
  `id` VARCHAR(64) NOT NULL,
  `jobId` VARCHAR(64) NOT NULL,
  `rowNumber` INTEGER NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `payload` JSON NOT NULL,
  `reservedNumber` VARCHAR(191) NULL,
  `recordId` VARCHAR(80) NULL,
  `errorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `business_import_job_items_job_row_uq` (`jobId`, `rowNumber`),
  INDEX `business_import_job_items_job_status_row_idx` (`jobId`, `status`, `rowNumber`),
  CONSTRAINT `business_import_job_items_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `business_import_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `business_import_number_reservations`
  ADD COLUMN `rowNumber` INTEGER NULL;

INSERT INTO `business_import_job_items`
  (`id`, `jobId`, `rowNumber`, `status`, `payload`, `reservedNumber`, `recordId`, `errorMessage`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('bir-', LEFT(SHA2(CONCAT(j.`id`, ':', jt.`rowNumber`), 256), 40)),
  j.`id`,
  jt.`rowNumber`,
  CASE
    WHEN jt.`executionStatus` IN ('queued', 'running', 'succeeded', 'failed') THEN jt.`executionStatus`
    WHEN jt.`precheckStatus` = 'blocked' THEN 'failed'
    ELSE 'queued'
  END,
  JSON_EXTRACT(j.`rows`, CONCAT('$[', jt.`ordinality` - 1, ']')),
  NULLIF(LOWER(TRIM(jt.`thirdPartyOrderNo`)), ''),
  NULLIF(jt.`recordId`, ''),
  NULLIF(jt.`errorMessage`, ''),
  j.`createdAt`,
  COALESCE(j.`finishedAt`, j.`startedAt`, j.`createdAt`)
FROM `business_import_jobs` j
JOIN JSON_TABLE(j.`rows`, '$[*]' COLUMNS(
  `ordinality` FOR ORDINALITY,
  `rowNumber` INTEGER PATH '$.rowNumber',
  `executionStatus` VARCHAR(32) PATH '$.executionStatus' NULL ON EMPTY,
  `precheckStatus` VARCHAR(32) PATH '$.status' NULL ON EMPTY,
  `thirdPartyOrderNo` VARCHAR(191) PATH '$.normalized.thirdPartyOrderNo' NULL ON EMPTY,
  `recordId` VARCHAR(80) PATH '$.recordId' NULL ON EMPTY,
  `errorMessage` VARCHAR(1000) PATH '$.errorMessage' NULL ON EMPTY
)) jt
WHERE jt.`rowNumber` IS NOT NULL;

UPDATE `business_import_number_reservations` r
JOIN `business_import_job_items` i
  ON i.`jobId` = r.`jobId` AND i.`reservedNumber` = r.`normalizedNumber`
SET r.`rowNumber` = i.`rowNumber`
WHERE r.`jobId` IS NOT NULL;
