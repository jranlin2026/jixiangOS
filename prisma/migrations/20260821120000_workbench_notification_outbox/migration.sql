-- Add a database-ordered durable notification outbox to task activities.
-- Existing activity rows receive sequence values during this additive ALTER, but their
-- historical order cannot be reconstructed safely. Keep them terminal instead of replaying
-- the raw history in arbitrary AUTO_INCREMENT rebuild order.
ALTER TABLE `task_activities`
  ADD COLUMN `sequence` BIGINT NOT NULL AUTO_INCREMENT,
  ADD COLUMN `notificationState` VARCHAR(24) NULL,
  ADD COLUMN `notificationPublishedAt` DATETIME(3) NULL,
  ADD COLUMN `notificationSkipReason` VARCHAR(100) NULL,
  ADD UNIQUE INDEX `task_activities_sequence_key` (`sequence`);

UPDATE `task_activities`
SET `notificationState` = 'SKIPPED',
    `notificationPublishedAt` = CURRENT_TIMESTAMP(3),
    `notificationSkipReason` = 'LEGACY_HISTORY_UNORDERED'
WHERE `notificationState` IS NULL;

ALTER TABLE `task_activities`
  MODIFY COLUMN `notificationState` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  ADD INDEX `task_activities_notificationState_sequence_idx` (`notificationState`, `sequence`);

ALTER TABLE `notification_activity_projections`
  ADD COLUMN `versionSequence` BIGINT NOT NULL DEFAULT 0;
