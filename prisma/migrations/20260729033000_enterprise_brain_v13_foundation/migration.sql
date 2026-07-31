CREATE TABLE `position_standards` (
  `id` VARCHAR(64) NOT NULL,
  `positionId` VARCHAR(64) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `currentVersionId` VARCHAR(64) NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdByName` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `position_standards_positionId_key`(`positionId`),
  INDEX `position_standards_currentVersionId_idx`(`currentVersionId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `position_standards_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `positions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `position_standard_versions` (
  `id` VARCHAR(64) NOT NULL,
  `standardId` VARCHAR(64) NOT NULL,
  `versionNumber` INTEGER NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  `mission` TEXT NOT NULL,
  `goals` JSON NOT NULL,
  `dailyActions` JSON NOT NULL,
  `kpis` JSON NOT NULL,
  `workflow` JSON NOT NULL,
  `speechTemplates` JSON NOT NULL,
  `faq` JSON NOT NULL,
  `effectiveAt` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `publishedById` VARCHAR(64) NULL,
  `publishedByName` VARCHAR(100) NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdByName` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `position_standard_versions_standardId_versionNumber_key`(`standardId`, `versionNumber`),
  INDEX `position_standard_versions_status_effectiveAt_idx`(`status`, `effectiveAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `position_standard_versions_standardId_fkey` FOREIGN KEY (`standardId`) REFERENCES `position_standards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `position_standard_resources` (
  `id` VARCHAR(64) NOT NULL,
  `standardVersionId` VARCHAR(64) NOT NULL,
  `knowledgeVersionId` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `position_standard_resources_version_knowledge_key`(`standardVersionId`, `knowledgeVersionId`),
  INDEX `position_standard_resources_knowledgeVersionId_idx`(`knowledgeVersionId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `position_standard_resources_standardVersionId_fkey` FOREIGN KEY (`standardVersionId`) REFERENCES `position_standard_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `position_standard_resources_knowledgeVersionId_fkey` FOREIGN KEY (`knowledgeVersionId`) REFERENCES `knowledge_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `task_templates` (
  `id` VARCHAR(64) NOT NULL,
  `positionId` VARCHAR(64) NOT NULL,
  `standardVersionId` VARCHAR(64) NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `targetValue` DECIMAL(12,2) NULL,
  `unit` VARCHAR(40) NULL,
  `scheduleType` VARCHAR(24) NOT NULL DEFAULT 'DAILY',
  `weekdays` JSON NOT NULL,
  `dueTime` VARCHAR(8) NULL,
  `evidenceRequired` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `effectiveAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdByName` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `task_templates_positionId_isActive_idx`(`positionId`, `isActive`),
  INDEX `task_templates_standardVersionId_idx`(`standardVersionId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `task_templates_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `positions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `task_templates_standardVersionId_fkey` FOREIGN KEY (`standardVersionId`) REFERENCES `position_standard_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_tasks` (
  `id` VARCHAR(64) NOT NULL,
  `templateId` VARCHAR(64) NULL,
  `employeeId` VARCHAR(64) NOT NULL,
  `employeeName` VARCHAR(100) NOT NULL,
  `departmentIdSnapshot` VARCHAR(64) NULL,
  `departmentNameSnapshot` VARCHAR(100) NULL,
  `positionIdSnapshot` VARCHAR(64) NULL,
  `positionNameSnapshot` VARCHAR(100) NULL,
  `standardVersionIdSnapshot` VARCHAR(64) NULL,
  `workDate` DATE NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `targetValue` DECIMAL(12,2) NULL,
  `actualValue` DECIMAL(12,2) NULL,
  `unit` VARCHAR(40) NULL,
  `evidenceRequired` BOOLEAN NOT NULL DEFAULT false,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `result` TEXT NULL,
  `dueAt` DATETIME(3) NULL,
  `assignedById` VARCHAR(64) NULL,
  `assignedByName` VARCHAR(100) NULL,
  `completedAt` DATETIME(3) NULL,
  `confirmedAt` DATETIME(3) NULL,
  `confirmedById` VARCHAR(64) NULL,
  `confirmedByName` VARCHAR(100) NULL,
  `returnedReason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `employee_tasks_template_employee_workDate_key`(`templateId`, `employeeId`, `workDate`),
  INDEX `employee_tasks_employee_workDate_status_idx`(`employeeId`, `workDate`, `status`),
  INDEX `employee_tasks_department_workDate_status_idx`(`departmentIdSnapshot`, `workDate`, `status`),
  INDEX `employee_tasks_dueAt_status_idx`(`dueAt`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `employee_tasks_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `task_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `task_evidence` (
  `id` VARCHAR(64) NOT NULL,
  `taskId` VARCHAR(64) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `referenceId` VARCHAR(160) NULL,
  `content` TEXT NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `task_evidence_taskId_createdAt_idx`(`taskId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `task_evidence_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `employee_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `daily_reviews` (
  `id` VARCHAR(64) NOT NULL,
  `employeeId` VARCHAR(64) NOT NULL,
  `employeeName` VARCHAR(100) NOT NULL,
  `departmentIdSnapshot` VARCHAR(64) NULL,
  `positionIdSnapshot` VARCHAR(64) NULL,
  `workDate` DATE NOT NULL,
  `completedSummary` TEXT NOT NULL,
  `problems` TEXT NOT NULL,
  `successCases` TEXT NOT NULL,
  `failureCases` TEXT NOT NULL,
  `customerNeeds` TEXT NOT NULL,
  `suggestions` TEXT NOT NULL,
  `aiSummary` TEXT NULL,
  `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `daily_reviews_employeeId_workDate_key`(`employeeId`, `workDate`),
  INDEX `daily_reviews_departmentId_workDate_idx`(`departmentIdSnapshot`, `workDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_conversations` (
  `id` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(64) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ai_conversations_userId_updatedAt_idx`(`userId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_messages` (
  `id` VARCHAR(64) NOT NULL,
  `conversationId` VARCHAR(64) NOT NULL,
  `role` VARCHAR(24) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `citations` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ai_messages_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ai_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ai_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_query_audits` (
  `id` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(64) NOT NULL,
  `conversationId` VARCHAR(64) NULL,
  `question` TEXT NOT NULL,
  `positionId` VARCHAR(64) NULL,
  `departmentId` VARCHAR(64) NULL,
  `retrievedVersionIds` JSON NOT NULL,
  `citationCount` INTEGER NOT NULL DEFAULT 0,
  `outcome` VARCHAR(32) NOT NULL,
  `model` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ai_query_audits_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `ai_query_audits_outcome_createdAt_idx`(`outcome`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_gaps` (
  `id` VARCHAR(64) NOT NULL,
  `question` TEXT NOT NULL,
  `normalizedHash` CHAR(64) NOT NULL,
  `positionId` VARCHAR(64) NULL,
  `departmentId` VARCHAR(64) NULL,
  `occurrenceCount` INTEGER NOT NULL DEFAULT 1,
  `status` VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  `firstAskedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastAskedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `knowledge_gaps_normalizedHash_key`(`normalizedHash`),
  INDEX `knowledge_gaps_status_lastAskedAt_idx`(`status`, `lastAskedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
