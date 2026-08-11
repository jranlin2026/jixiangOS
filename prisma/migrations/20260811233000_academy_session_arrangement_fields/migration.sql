ALTER TABLE `academy_sessions`
  ADD COLUMN `deliveryMode` VARCHAR(24) NOT NULL DEFAULT 'LIVE',
  ADD COLUMN `meetingUrl` VARCHAR(500) NULL,
  ADD COLUMN `inviteTarget` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `registrationTarget` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `attendanceTarget` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `consultationTarget` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `dealTarget` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `targetRevenue` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `lecturerUserId` VARCHAR(64) NULL,
  ADD COLUMN `lecturerUserName` VARCHAR(100) NULL,
  ADD COLUMN `collaboratorUserIds` JSON NULL,
  ADD COLUMN `collaboratorNames` JSON NULL;

CREATE INDEX `academy_sessions_deliveryMode_startsAt_idx`
  ON `academy_sessions`(`deliveryMode`, `startsAt`);
