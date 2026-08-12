ALTER TABLE `academy_sessions`
  ADD COLUMN `isHistoricalBackfill` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `academy_session_tasks`
  ADD COLUMN `dueAnchor` VARCHAR(24) NULL,
  ADD COLUMN `dueOffsetMinutes` INTEGER NULL;

UPDATE `academy_session_tasks`
SET
  `dueAnchor` = CASE WHEN `category` = 'AFTER' THEN 'ENDS_AT' ELSE 'STARTS_AT' END,
  `dueOffsetMinutes` = CASE
    WHEN `dueAt` IS NULL THEN NULL
    WHEN `category` = 'AFTER' THEN TIMESTAMPDIFF(MINUTE, (
      SELECT `endsAt` FROM `academy_sessions` WHERE `academy_sessions`.`id` = `academy_session_tasks`.`sessionId`
    ), `dueAt`)
    ELSE TIMESTAMPDIFF(MINUTE, (
      SELECT `startsAt` FROM `academy_sessions` WHERE `academy_sessions`.`id` = `academy_session_tasks`.`sessionId`
    ), `dueAt`)
  END;
