UPDATE `academy_session_tasks` AS `task`
INNER JOIN `academy_sop_template_steps` AS `step`
  ON `step`.`id` = `task`.`sopTemplateStepId`
INNER JOIN `academy_sessions` AS `session`
  ON `session`.`id` = `task`.`sessionId`
SET
  `task`.`dueAnchor` = `step`.`dueAnchor`,
  `task`.`dueOffsetMinutes` = CASE
    WHEN `task`.`dueAt` IS NULL THEN NULL
    WHEN `step`.`dueAnchor` = 'ENDS_AT' THEN TIMESTAMPDIFF(MINUTE, `session`.`endsAt`, `task`.`dueAt`)
    ELSE TIMESTAMPDIFF(MINUTE, `session`.`startsAt`, `task`.`dueAt`)
  END;
