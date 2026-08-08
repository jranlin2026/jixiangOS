ALTER TABLE `lead_records`
  ADD COLUMN `externalIntakeKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `lead_records_externalIntakeKey_key`
  ON `lead_records`(`externalIntakeKey`);

ALTER TABLE `browser_lead_syncs`
  ADD COLUMN `sourceProductName` VARCHAR(240) NULL;
