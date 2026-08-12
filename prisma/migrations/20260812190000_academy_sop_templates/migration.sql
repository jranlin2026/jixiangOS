ALTER TABLE `academy_courses`
  ADD COLUMN `sopTemplateId` VARCHAR(64) NULL;

ALTER TABLE `academy_session_tasks`
  ADD COLUMN `sopTemplateId` VARCHAR(64) NULL,
  ADD COLUMN `sopTemplateStepId` VARCHAR(64) NULL,
  ADD COLUMN `assigneeRole` VARCHAR(40) NULL,
  ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `completionMode` VARCHAR(24) NOT NULL DEFAULT 'CONFIRM',
  ADD COLUMN `requiresReview` BOOLEAN NOT NULL DEFAULT false;

-- Preserve the behavior of existing in-flight tasks. New arrangements use the
-- selected template snapshot; legacy tasks keep their prior evidence/review gate.
UPDATE `academy_session_tasks`
SET `sortOrder` = CASE `templateKey`
      WHEN 'COURSE_CONFIRMATION' THEN 1 WHEN 'PLANNING' THEN 1
      WHEN 'COURSE_DEVELOPMENT' THEN 2 WHEN 'CONTENT' THEN 2
      WHEN 'COURSE_PACKAGING' THEN 3 WHEN 'ASSETS' THEN 3
      WHEN 'CUSTOMER_INVITATION' THEN 4 WHEN 'INVITATION' THEN 4
      WHEN 'PRECLASS_GATE' THEN 5 WHEN 'PRECHECK' THEN 5
      WHEN 'COURSE_DELIVERY' THEN 6 WHEN 'DELIVERY' THEN 6
      WHEN 'CUSTOMER_SEGMENTATION' THEN 7 WHEN 'SEGMENTATION' THEN 7
      WHEN 'DEAL_FOLLOW_UP' THEN 8 WHEN 'FOLLOW_UP' THEN 8
      WHEN 'COURSE_REVIEW' THEN 9 WHEN 'REVIEW' THEN 9
      ELSE 99
    END,
    `sopTemplateId` = 'academy-sop-default-live',
    `sopTemplateStepId` = CASE `templateKey`
      WHEN 'COURSE_CONFIRMATION' THEN 'academy-sop-step-confirm' WHEN 'PLANNING' THEN 'academy-sop-step-confirm'
      WHEN 'COURSE_DEVELOPMENT' THEN 'academy-sop-step-develop' WHEN 'CONTENT' THEN 'academy-sop-step-develop'
      WHEN 'COURSE_PACKAGING' THEN 'academy-sop-step-package' WHEN 'ASSETS' THEN 'academy-sop-step-package'
      WHEN 'CUSTOMER_INVITATION' THEN 'academy-sop-step-invite' WHEN 'INVITATION' THEN 'academy-sop-step-invite'
      WHEN 'PRECLASS_GATE' THEN 'academy-sop-step-gate' WHEN 'PRECHECK' THEN 'academy-sop-step-gate'
      WHEN 'COURSE_DELIVERY' THEN 'academy-sop-step-delivery' WHEN 'DELIVERY' THEN 'academy-sop-step-delivery'
      WHEN 'CUSTOMER_SEGMENTATION' THEN 'academy-sop-step-segment' WHEN 'SEGMENTATION' THEN 'academy-sop-step-segment'
      WHEN 'DEAL_FOLLOW_UP' THEN 'academy-sop-step-follow' WHEN 'FOLLOW_UP' THEN 'academy-sop-step-follow'
      WHEN 'COURSE_REVIEW' THEN 'academy-sop-step-review' WHEN 'REVIEW' THEN 'academy-sop-step-review'
      ELSE NULL
    END,
    `assigneeRole` = CASE `templateKey`
      WHEN 'COURSE_DEVELOPMENT' THEN 'CONTENT_OWNER' WHEN 'CONTENT' THEN 'CONTENT_OWNER'
      WHEN 'COURSE_PACKAGING' THEN 'MATERIAL_OWNER' WHEN 'ASSETS' THEN 'MATERIAL_OWNER'
      WHEN 'COURSE_DELIVERY' THEN 'LECTURER' WHEN 'DELIVERY' THEN 'LECTURER'
      WHEN 'COURSE_REVIEW' THEN 'REVIEW_OWNER' WHEN 'REVIEW' THEN 'REVIEW_OWNER'
      ELSE 'PROJECT_OWNER'
    END,
    `completionMode` = CASE
      WHEN `templateKey` IN ('COURSE_DEVELOPMENT', 'COURSE_PACKAGING', 'CONTENT', 'ASSETS') THEN 'ATTACHMENT'
      ELSE 'NOTE'
    END,
    `requiresReview` = true;

CREATE TABLE `academy_sop_templates` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `description` TEXT NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `createdById` VARCHAR(64) NOT NULL,
  `createdByName` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `academy_sop_templates_status_updatedAt_idx` (`status`, `updatedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `academy_sop_template_steps` (
  `id` VARCHAR(64) NOT NULL,
  `templateId` VARCHAR(64) NOT NULL,
  `stepKey` VARCHAR(40) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `category` VARCHAR(24) NOT NULL,
  `sortOrder` INTEGER NOT NULL,
  `assigneeRole` VARCHAR(40) NOT NULL,
  `dueAnchor` VARCHAR(24) NOT NULL DEFAULT 'STARTS_AT',
  `dueOffsetMinutes` INTEGER NULL,
  `completionMode` VARCHAR(24) NOT NULL DEFAULT 'CONFIRM',
  `requiresReview` BOOLEAN NOT NULL DEFAULT false,
  `acceptanceCriteria` TEXT NULL,
  `isRequired` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `academy_sop_template_steps_templateId_stepKey_key` (`templateId`, `stepKey`),
  INDEX `academy_sop_template_steps_templateId_sortOrder_idx` (`templateId`, `sortOrder`),
  CONSTRAINT `academy_sop_template_steps_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `academy_sop_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `academy_courses`
  ADD CONSTRAINT `academy_courses_sopTemplateId_fkey` FOREIGN KEY (`sopTemplateId`) REFERENCES `academy_sop_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `academy_sop_templates` (`id`, `name`, `description`, `status`, `isDefault`, `createdById`, `createdByName`, `createdAt`, `updatedAt`)
VALUES ('academy-sop-default-live', '单场课程标准流程', '课程确定、内容准备、开课执行、成交跟进与复盘的默认流程，可在模板设置中调整。', 'ACTIVE', true, 'system', '系统初始化', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `academy_sop_template_steps` (`id`, `templateId`, `stepKey`, `title`, `category`, `sortOrder`, `assigneeRole`, `dueAnchor`, `dueOffsetMinutes`, `completionMode`, `requiresReview`, `acceptanceCriteria`, `isRequired`, `createdAt`, `updatedAt`) VALUES
('academy-sop-step-confirm', 'academy-sop-default-live', 'COURSE_CONFIRMATION', '课程确定', 'BEFORE', 1, 'PROJECT_OWNER', 'STARTS_AT', -7200, 'NOTE', true, '课程主题、目标客户、课程目标、转化产品和主讲人已确认。', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('academy-sop-step-develop', 'academy-sop-default-live', 'COURSE_DEVELOPMENT', '课程研发', 'BEFORE', 2, 'CONTENT_OWNER', 'STARTS_AT', -5760, 'ATTACHMENT', true, '课程大纲、核心观点、案例和课件内容已完成。', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('academy-sop-step-package', 'academy-sop-default-live', 'COURSE_PACKAGING', '课程包装', 'BEFORE', 3, 'MATERIAL_OWNER', 'STARTS_AT', -4320, 'ATTACHMENT', true, '海报、邀约素材和课程宣传内容已准备。', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('academy-sop-step-invite', 'academy-sop-default-live', 'CUSTOMER_INVITATION', '客户邀约', 'BEFORE', 4, 'PROJECT_OWNER', 'STARTS_AT', -2880, 'CONFIRM', false, '邀约名单和客户状态已确认。', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('academy-sop-step-gate', 'academy-sop-default-live', 'PRECLASS_GATE', '开课确认', 'BEFORE', 5, 'PROJECT_OWNER', 'STARTS_AT', -120, 'CHECKLIST', true, '场地、直播、设备、课程内容和邀约名单均已确认。', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('academy-sop-step-delivery', 'academy-sop-default-live', 'COURSE_DELIVERY', '课程执行', 'DURING', 6, 'LECTURER', 'ENDS_AT', 0, 'NOTE', false, '完成授课并记录现场问题和客户反馈。', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('academy-sop-step-segment', 'academy-sop-default-live', 'CUSTOMER_SEGMENTATION', '客户分层', 'AFTER', 7, 'PROJECT_OWNER', 'ENDS_AT', 30, 'CONFIRM', false, '完成客户分层并明确重点客户下一步。', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('academy-sop-step-follow', 'academy-sop-default-live', 'DEAL_FOLLOW_UP', '成交跟进', 'AFTER', 8, 'PROJECT_OWNER', 'ENDS_AT', 1440, 'CONFIRM', false, '重点客户已成交或已明确下一次跟进计划。', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('academy-sop-step-review', 'academy-sop-default-live', 'COURSE_REVIEW', '复盘优化', 'AFTER', 9, 'REVIEW_OWNER', 'ENDS_AT', 4320, 'NOTE', true, '课程数据、问题、经验与下一场改进动作已记录。', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- Every course gets an explicit template snapshot source. Future changes to
-- which template is default must not silently change an existing course.
UPDATE `academy_courses`
SET `sopTemplateId` = 'academy-sop-default-live'
WHERE `sopTemplateId` IS NULL;
