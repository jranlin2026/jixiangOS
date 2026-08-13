ALTER TABLE `okr_cycles`
  ADD COLUMN `cycleType` VARCHAR(24) NOT NULL DEFAULT 'QUARTER',
  ADD COLUMN `periodKey` VARCHAR(64) NULL;

UPDATE `okr_cycles`
SET `periodKey` = CONCAT(`year`, '-Q', `quarter`)
WHERE `periodKey` IS NULL;

ALTER TABLE `okr_cycles`
  MODIFY COLUMN `quarter` INTEGER NULL,
  MODIFY COLUMN `periodKey` VARCHAR(64) NOT NULL,
  DROP INDEX `okr_cycles_year_quarter_key`,
  ADD UNIQUE INDEX `okr_cycles_cycleType_periodKey_key`(`cycleType`, `periodKey`);
