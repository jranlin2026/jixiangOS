CREATE TABLE `academy_courses` (
  `id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(80) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `category` VARCHAR(80) NOT NULL,
  `summary` TEXT NOT NULL,
  `defaultDurationMinutes` INTEGER NOT NULL,
  `objectives` JSON NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  `ownerUserId` VARCHAR(64) NOT NULL,
  `ownerUserName` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `academy_courses_code_key`(`code`),
  INDEX `academy_courses_status_updatedAt_idx`(`status`, `updatedAt`),
  INDEX `academy_courses_category_status_idx`(`category`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `academy_course_versions` (
  `id` VARCHAR(64) NOT NULL,
  `courseId` VARCHAR(64) NOT NULL,
  `versionNumber` INTEGER NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  `title` VARCHAR(200) NOT NULL,
  `summary` TEXT NOT NULL,
  `objectives` JSON NOT NULL,
  `outline` JSON NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdByName` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `academy_course_versions_status_updatedAt_idx`(`status`, `updatedAt`),
  UNIQUE INDEX `academy_course_versions_courseId_versionNumber_key`(`courseId`, `versionNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `academy_sessions` (
  `id` VARCHAR(64) NOT NULL,
  `courseId` VARCHAR(64) NOT NULL,
  `courseVersionId` VARCHAR(64) NULL,
  `title` VARCHAR(200) NOT NULL,
  `startsAt` DATETIME(3) NOT NULL,
  `endsAt` DATETIME(3) NOT NULL,
  `venue` VARCHAR(240) NOT NULL,
  `capacity` INTEGER NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PLANNED',
  `facilitatorUserId` VARCHAR(64) NULL,
  `facilitatorUserName` VARCHAR(100) NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdByName` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `academy_sessions_startsAt_status_idx`(`startsAt`, `status`),
  INDEX `academy_sessions_courseId_startsAt_idx`(`courseId`, `startsAt`),
  INDEX `academy_sessions_facilitatorUserId_startsAt_idx`(`facilitatorUserId`, `startsAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `academy_session_tasks` (
  `id` VARCHAR(64) NOT NULL,
  `sessionId` VARCHAR(64) NOT NULL,
  `templateKey` VARCHAR(40) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `category` VARCHAR(24) NOT NULL,
  `isRequired` BOOLEAN NOT NULL DEFAULT true,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `note` TEXT NULL,
  `completedAt` DATETIME(3) NULL,
  `completedById` VARCHAR(64) NULL,
  `completedByName` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `academy_session_tasks_sessionId_templateKey_key`(`sessionId`, `templateKey`),
  INDEX `academy_session_tasks_sessionId_category_status_idx`(`sessionId`, `category`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `academy_engagements` (
  `id` VARCHAR(64) NOT NULL,
  `sessionId` VARCHAR(64) NOT NULL,
  `participantKey` VARCHAR(160) NOT NULL,
  `customerId` VARCHAR(80) NULL,
  `leadId` VARCHAR(80) NULL,
  `participantName` VARCHAR(200) NOT NULL,
  `invitationStatus` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `attendanceStatus` VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN',
  `interactionLevel` VARCHAR(24) NULL,
  `courseAssessment` VARCHAR(12) NULL,
  `followUpStatus` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `notes` TEXT NULL,
  `ownerUserId` VARCHAR(64) NULL,
  `ownerUserName` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `academy_engagements_sessionId_participantKey_key`(`sessionId`, `participantKey`),
  INDEX `academy_engagements_sessionId_attendanceStatus_idx`(`sessionId`, `attendanceStatus`),
  INDEX `academy_engagements_ownerUserId_followUpStatus_idx`(`ownerUserId`, `followUpStatus`),
  INDEX `academy_engagements_customerId_idx`(`customerId`),
  INDEX `academy_engagements_leadId_idx`(`leadId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `academy_session_reviews` (
  `id` VARCHAR(64) NOT NULL,
  `sessionId` VARCHAR(64) NOT NULL,
  `summary` TEXT NOT NULL,
  `issues` TEXT NOT NULL,
  `improvements` TEXT NOT NULL,
  `metrics` JSON NOT NULL,
  `actionItems` JSON NOT NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdByName` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `academy_session_reviews_sessionId_key`(`sessionId`),
  INDEX `academy_session_reviews_updatedAt_idx`(`updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `academy_course_versions` ADD CONSTRAINT `academy_course_versions_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `academy_courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `academy_sessions` ADD CONSTRAINT `academy_sessions_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `academy_courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `academy_sessions` ADD CONSTRAINT `academy_sessions_courseVersionId_fkey` FOREIGN KEY (`courseVersionId`) REFERENCES `academy_course_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `academy_session_tasks` ADD CONSTRAINT `academy_session_tasks_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `academy_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `academy_engagements` ADD CONSTRAINT `academy_engagements_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `academy_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `academy_session_reviews` ADD CONSTRAINT `academy_session_reviews_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `academy_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
