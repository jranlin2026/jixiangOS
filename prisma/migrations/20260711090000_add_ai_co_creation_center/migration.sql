CREATE TABLE `co_creation_requests` (
  `id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `status` ENUM('DRAFT','INTERVIEWING','EMPLOYEE_CONFIRMATION','FACT_CONFIRMATION','MANAGEMENT_REVIEW','VALIDATION_APPROVED','VALIDATING','PROJECT_DECISION','APPROVED','DEFERRED','MERGED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  `requesterId` VARCHAR(64) NOT NULL,
  `requesterName` VARCHAR(100) NOT NULL,
  `departmentId` VARCHAR(64) NULL,
  `supervisorId` VARCHAR(64) NULL,
  `mergedIntoId` VARCHAR(64) NULL,
  `decisionReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `co_creation_requests_requesterId_createdAt_idx` (`requesterId`, `createdAt`),
  INDEX `co_creation_requests_departmentId_status_idx` (`departmentId`, `status`),
  INDEX `co_creation_requests_supervisorId_status_idx` (`supervisorId`, `status`),
  INDEX `co_creation_requests_status_updatedAt_idx` (`status`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `co_creation_messages` (
  `id` VARCHAR(64) NOT NULL,
  `requestId` VARCHAR(64) NOT NULL,
  `role` ENUM('USER','ASSISTANT','SYSTEM') NOT NULL,
  `content` TEXT NOT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `co_creation_messages_requestId_createdAt_idx` (`requestId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `co_creation_messages_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `co_creation_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `co_creation_briefs` (
  `id` VARCHAR(64) NOT NULL,
  `requestId` VARCHAR(64) NOT NULL,
  `problemStatement` TEXT NOT NULL,
  `currentWorkflow` TEXT NOT NULL,
  `painPoints` JSON NOT NULL,
  `affectedRoles` JSON NOT NULL,
  `frequency` VARCHAR(100) NULL,
  `impact` TEXT NULL,
  `desiredOutcome` TEXT NOT NULL,
  `acceptanceCriteria` JSON NOT NULL,
  `evidence` JSON NOT NULL,
  `employeeStatements` JSON NOT NULL,
  `aiHypotheses` JSON NOT NULL,
  `confirmedFacts` JSON NOT NULL,
  `openQuestions` JSON NOT NULL,
  `classification` VARCHAR(100) NULL,
  `prioritySuggestion` VARCHAR(20) NULL,
  `completeness` INTEGER NOT NULL DEFAULT 0,
  `employeeConfirmedAt` DATETIME(3) NULL,
  `factsConfirmedAt` DATETIME(3) NULL,
  `factsConfirmedBy` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `co_creation_briefs_requestId_key` (`requestId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `co_creation_briefs_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `co_creation_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `co_creation_validations` (
  `id` VARCHAR(64) NOT NULL,
  `requestId` VARCHAR(64) NOT NULL,
  `ownerId` VARCHAR(64) NULL,
  `plan` JSON NOT NULL,
  `evidence` JSON NOT NULL,
  `confirmedFacts` JSON NOT NULL,
  `metrics` JSON NOT NULL,
  `unresolvedQuestions` JSON NOT NULL,
  `recommendation` TEXT NULL,
  `conclusion` TEXT NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `co_creation_validations_requestId_key` (`requestId`),
  INDEX `co_creation_validations_ownerId_idx` (`ownerId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `co_creation_validations_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `co_creation_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `co_creation_events` (
  `id` VARCHAR(64) NOT NULL,
  `requestId` VARCHAR(64) NOT NULL,
  `actorId` VARCHAR(64) NOT NULL,
  `actorName` VARCHAR(100) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `fromState` VARCHAR(50) NULL,
  `toState` VARCHAR(50) NULL,
  `detail` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `co_creation_events_requestId_createdAt_idx` (`requestId`, `createdAt`),
  INDEX `co_creation_events_actorId_createdAt_idx` (`actorId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `co_creation_events_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `co_creation_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
