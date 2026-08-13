ALTER TABLE `academy_sessions`
  ADD COLUMN `taskReviewerUserId` VARCHAR(64) NULL,
  ADD COLUMN `taskReviewerUserName` VARCHAR(100) NULL;

UPDATE `academy_sessions`
SET
  `taskReviewerUserId` = `facilitatorUserId`,
  `taskReviewerUserName` = `facilitatorUserName`
WHERE `taskReviewerUserId` IS NULL;

CREATE INDEX `academy_sessions_taskReviewerUserId_startsAt_idx`
  ON `academy_sessions`(`taskReviewerUserId`, `startsAt`);
