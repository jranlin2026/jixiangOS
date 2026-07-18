ALTER TABLE `business_records`
  ADD COLUMN `mergedIntoId` VARCHAR(80) NULL,
  ADD COLUMN `mergedAt` DATETIME(3) NULL,
  ADD COLUMN `mergedById` VARCHAR(64) NULL,
  ADD COLUMN `mergedByName` VARCHAR(100) NULL,
  ADD COLUMN `mergeLedgerId` VARCHAR(64) NULL,
  ADD COLUMN `recordRevision` INTEGER NOT NULL DEFAULT 0;

CREATE INDEX `business_records_domain_mergedIntoId_idx`
  ON `business_records`(`domain`, `mergedIntoId`);
CREATE INDEX `business_records_domain_mergeLedgerId_idx`
  ON `business_records`(`domain`, `mergeLedgerId`);

CREATE TABLE `customer_merge_ledgers` (
  `id` VARCHAR(64) NOT NULL,
  `duplicateGroupId` VARCHAR(64) NULL,
  `mainCustomerId` VARCHAR(80) NOT NULL,
  `secondaryCustomerIds` JSON NOT NULL,
  `fieldDecisions` JSON NOT NULL,
  `tagDecision` JSON NOT NULL,
  `encryptedCustomerSnapshots` LONGTEXT NOT NULL,
  `snapshotKeyVersion` INTEGER NOT NULL,
  `guardManifest` JSON NOT NULL,
  `reason` TEXT NOT NULL,
  `actorId` VARCHAR(64) NOT NULL,
  `actorName` VARCHAR(100) NOT NULL,
  `mergeInputHash` CHAR(64) NOT NULL,
  `mergeIdempotencyKey` VARCHAR(80) NOT NULL,
  `mergeIdempotencyFingerprint` CHAR(64) NOT NULL,
  `mergedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `undoDeadlineAt` DATETIME(3) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'merged',
  `undoneAt` DATETIME(3) NULL,
  `undoneById` VARCHAR(64) NULL,
  `undoneByName` VARCHAR(100) NULL,
  `undoInputHash` CHAR(64) NULL,
  `undoIdempotencyKey` VARCHAR(80) NULL,
  `undoIdempotencyFingerprint` CHAR(64) NULL,
  `lastUndoBlockedAt` DATETIME(3) NULL,
  `undoConflicts` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_merge_ledgers_actorId_mergeIdempotencyKey_key` (`actorId`, `mergeIdempotencyKey`),
  UNIQUE INDEX `customer_merge_ledgers_undoneById_undoIdempotencyKey_key` (`undoneById`, `undoIdempotencyKey`),
  INDEX `customer_merge_ledgers_mainCustomerId_idx` (`mainCustomerId`),
  INDEX `customer_merge_ledgers_duplicateGroupId_idx` (`duplicateGroupId`),
  INDEX `customer_merge_ledgers_status_undoDeadlineAt_idx` (`status`, `undoDeadlineAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_merge_ledger_entries` (
  `id` VARCHAR(64) NOT NULL,
  `ledgerId` VARCHAR(64) NOT NULL,
  `domain` VARCHAR(80) NOT NULL,
  `recordId` VARCHAR(160) NOT NULL,
  `beforeSnapshot` JSON NOT NULL,
  `afterSnapshot` JSON NOT NULL,
  `rowRevision` INTEGER NULL,
  `updatedAtValue` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_merge_ledger_entries_ledgerId_domain_recordId_key` (`ledgerId`, `domain`, `recordId`),
  INDEX `customer_merge_ledger_entries_domain_recordId_idx` (`domain`, `recordId`),
  CONSTRAINT `customer_merge_ledger_entries_ledgerId_fkey`
    FOREIGN KEY (`ledgerId`) REFERENCES `customer_merge_ledgers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
