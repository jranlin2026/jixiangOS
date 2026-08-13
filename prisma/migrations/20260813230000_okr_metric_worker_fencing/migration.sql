ALTER TABLE `okr_metric_bindings`
  ADD COLUMN `nextRefreshAt` DATETIME(3) NULL,
  ADD COLUMN `leaseOwner` VARCHAR(128) NULL,
  ADD COLUMN `leaseEpoch` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL;

UPDATE `okr_metric_bindings`
SET `nextRefreshAt` = COALESCE(`updatedAt`, CURRENT_TIMESTAMP(3))
WHERE `nextRefreshAt` IS NULL;

ALTER TABLE `okr_metric_snapshots`
  ADD COLUMN `refreshSlot` VARCHAR(40) NULL;

UPDATE `okr_metric_snapshots`
SET `refreshSlot` = CONCAT(
  DATE_FORMAT(`measuredAt`, '%Y%m%dT%H%i%s'),
  '-',
  LEFT(REPLACE(`id`, '-', ''), 16)
)
WHERE `refreshSlot` IS NULL;

ALTER TABLE `okr_metric_snapshots`
  MODIFY `refreshSlot` VARCHAR(40) NOT NULL;

CREATE INDEX `okr_key_results_ownerId_dueAt_id_idx`
  ON `okr_key_results`(`ownerId`, `dueAt`, `id`);
CREATE INDEX `okr_metric_bindings_nextRefreshAt_leaseExpiresAt_id_idx`
  ON `okr_metric_bindings`(`nextRefreshAt`, `leaseExpiresAt`, `id`);
CREATE UNIQUE INDEX `okr_metric_snapshots_bindingId_refreshSlot_key`
  ON `okr_metric_snapshots`(`bindingId`, `refreshSlot`);

DROP INDEX `okr_cycles_status_startAt_idx` ON `okr_cycles`;
CREATE INDEX `okr_cycles_status_startAt_id_idx`
  ON `okr_cycles`(`status`, `startAt`, `id`);

CREATE INDEX `okr_objectives_cycleId_status_updatedAt_id_idx`
  ON `okr_objectives`(`cycleId`, `status`, `updatedAt`, `id`);
CREATE INDEX `okr_objectives_ownerId_cycleId_updatedAt_id_idx`
  ON `okr_objectives`(`ownerId`, `cycleId`, `updatedAt`, `id`);
CREATE INDEX `okr_objectives_departmentId_cycleId_updatedAt_id_idx`
  ON `okr_objectives`(`departmentId`, `cycleId`, `updatedAt`, `id`);

DROP INDEX `okr_objectives_cycleId_status_updatedAt_idx` ON `okr_objectives`;
DROP INDEX `okr_objectives_ownerId_cycleId_idx` ON `okr_objectives`;
DROP INDEX `okr_objectives_departmentId_cycleId_idx` ON `okr_objectives`;
