ALTER TABLE `employee_tasks`
  ADD COLUMN `sourceType` VARCHAR(64) NULL,
  ADD COLUMN `sourceId` VARCHAR(80) NULL,
  ADD COLUMN `sourceItemId` VARCHAR(80) NULL;

CREATE INDEX `employee_tasks_source_idx`
  ON `employee_tasks`(`sourceType`, `sourceId`, `sourceItemId`);
