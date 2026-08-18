ALTER TABLE `academy_sop_template_steps`
  ADD COLUMN `stageKey` VARCHAR(64) NULL,
  ADD COLUMN `stageName` VARCHAR(160) NULL,
  ADD COLUMN `stageOrder` INTEGER NULL;

UPDATE `academy_sop_template_steps`
SET
  `stageKey` = `stepKey`,
  `stageName` = `title`,
  `stageOrder` = `sortOrder`;

ALTER TABLE `academy_sop_template_steps`
  MODIFY `stageKey` VARCHAR(64) NOT NULL,
  MODIFY `stageName` VARCHAR(160) NOT NULL,
  MODIFY `stageOrder` INTEGER NOT NULL,
  ADD INDEX `academy_sop_template_steps_templateId_category_stageOrder_idx` (`templateId`, `category`, `stageOrder`);

ALTER TABLE `academy_session_tasks`
  ADD COLUMN `stageKey` VARCHAR(64) NULL,
  ADD COLUMN `stageName` VARCHAR(160) NULL,
  ADD COLUMN `stageOrder` INTEGER NULL,
  ADD COLUMN `isUnlocked` BOOLEAN NOT NULL DEFAULT true;

UPDATE `academy_session_tasks`
SET
  `stageKey` = `templateKey`,
  `stageName` = `title`,
  `stageOrder` = `sortOrder`,
  `isUnlocked` = CASE
    WHEN `status` IN ('DONE', 'SKIPPED', 'SUBMITTED', 'IN_PROGRESS', 'REJECTED', 'BLOCKED') THEN true
    ELSE false
  END;

UPDATE `academy_session_tasks` AS `task`
JOIN `academy_sessions` AS `session` ON `session`.`id` = `task`.`sessionId`
JOIN (
  SELECT
    `candidate`.`sessionId`,
    COALESCE(
      MIN(CASE
        WHEN `candidate`.`isRequired` = true AND `candidate`.`status` NOT IN ('DONE', 'SKIPPED')
          THEN `candidate`.`stageOrder`
        ELSE NULL
      END),
      MAX(`candidate`.`stageOrder`)
    ) AS `unlockThroughStageOrder`
  FROM `academy_session_tasks` AS `candidate`
  JOIN `academy_sessions` AS `candidate_session` ON `candidate_session`.`id` = `candidate`.`sessionId`
  WHERE `candidate`.`category` = CASE
      WHEN `candidate_session`.`status` IN ('PLANNED', 'READY') THEN 'BEFORE'
      WHEN `candidate_session`.`status` = 'IN_PROGRESS' THEN 'DURING'
      WHEN `candidate_session`.`status` = 'POST_COURSE' THEN 'AFTER'
      ELSE '__NONE__'
    END
  GROUP BY `candidate`.`sessionId`
) AS `current_stage`
  ON `current_stage`.`sessionId` = `task`.`sessionId`
  AND `task`.`stageOrder` <= `current_stage`.`unlockThroughStageOrder`
  AND `task`.`category` = CASE
    WHEN `session`.`status` IN ('PLANNED', 'READY') THEN 'BEFORE'
    WHEN `session`.`status` = 'IN_PROGRESS' THEN 'DURING'
    WHEN `session`.`status` = 'POST_COURSE' THEN 'AFTER'
    ELSE '__NONE__'
  END
SET `task`.`isUnlocked` = true;

ALTER TABLE `academy_session_tasks`
  MODIFY `stageKey` VARCHAR(64) NOT NULL,
  MODIFY `stageName` VARCHAR(160) NOT NULL,
  MODIFY `stageOrder` INTEGER NOT NULL,
  ADD INDEX `academy_session_tasks_sessionId_category_stageOrder_isUnlocked_idx` (`sessionId`, `category`, `stageOrder`, `isUnlocked`);
