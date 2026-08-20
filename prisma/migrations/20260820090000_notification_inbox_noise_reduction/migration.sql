-- The lead acknowledgement escalation is replaced by a single first-follow-up
-- escalation. Cancel legacy pending schedules before the notification worker
-- can publish both messages for the same lead.
CREATE TABLE `notification_activity_projections` (
  `activityKey` VARCHAR(191) NOT NULL,
  `currentNotificationId` VARCHAR(64) NOT NULL,
  `versionAt` DATETIME(3) NOT NULL,
  `stage` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `notification_activity_projections_currentNotificationId_idx` (`currentNotificationId`),
  PRIMARY KEY (`activityKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Open lead schedules are a technical queue rather than business history.
-- Remove them so the startup bootstrap can rebuild only the current and future
-- stages with the new rule; completed/canceled rows remain as audit history.
DELETE FROM `reminder_schedules`
WHERE `eventType` IN (
  'LEAD_ACK_REMINDER',
  'LEAD_ACK_ESCALATION',
  'LEAD_FIRST_FOLLOW_UP_DUE',
  'LEAD_FIRST_FOLLOW_UP_ESCALATION'
)
  AND `status` IN ('PENDING', 'PROCESSING', 'FAILED');

UPDATE `notifications`
SET
  `resolvedAt` = CURRENT_TIMESTAMP(3),
  `resolvedReason` = '旧提醒已由降噪策略重新计算',
  `readAt` = COALESCE(`readAt`, CURRENT_TIMESTAMP(3)),
  `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `eventType` IN (
  'LEAD_ASSIGNED',
  'LEAD_ACK_REMINDER',
  'LEAD_ACK_ESCALATION',
  'LEAD_FIRST_FOLLOW_UP_DUE',
  'LEAD_FIRST_FOLLOW_UP_ESCALATION'
)
  AND `resolvedAt` IS NULL;

-- Apply the quieter defaults to an already-persisted lead rule as well. Without
-- this migration, installations that opened the settings page before this
-- release would keep the original 5/15/30/60 minute cadence indefinitely.
UPDATE `notification_rules`
SET
  `config` = JSON_SET(
    JSON_REMOVE(`config`, '$.ackEscalationMinutes'),
    '$.ackReminderMinutes', 20,
    '$.firstFollowUpReminderMinutes', 60,
    '$.firstFollowUpEscalationMinutes', 120
  ),
  `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `eventType` = 'LEAD_WORKFLOW'
  AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(`config`, '$.ackReminderMinutes')) AS UNSIGNED), 5) = 5
  AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(`config`, '$.ackEscalationMinutes')) AS UNSIGNED), 15) = 15
  AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(`config`, '$.firstFollowUpReminderMinutes')) AS UNSIGNED), 30) = 30
  AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(`config`, '$.firstFollowUpEscalationMinutes')) AS UNSIGNED), 60) = 60;

-- Existing active notifications predate the current-reminder projection.
-- Keep only the newest employee-facing stage for each business and recipient;
-- resolved rows remain available as history.
UPDATE `notifications` AS `older`
JOIN `notifications` AS `newer`
  ON `older`.`businessId` = `newer`.`businessId`
  AND `older`.`recipientId` = `newer`.`recipientId`
  AND `newer`.`resolvedAt` IS NULL
  AND (
    `newer`.`createdAt` > `older`.`createdAt`
    OR (`newer`.`createdAt` = `older`.`createdAt` AND `newer`.`id` > `older`.`id`)
  )
  AND (
    (`older`.`eventType` IN ('LEAD_ASSIGNED', 'LEAD_ACK_REMINDER', 'LEAD_FIRST_FOLLOW_UP_DUE')
      AND `newer`.`eventType` IN ('LEAD_ASSIGNED', 'LEAD_ACK_REMINDER', 'LEAD_FIRST_FOLLOW_UP_DUE'))
    OR
    (`older`.`eventType` IN ('LEAD_ACK_ESCALATION', 'LEAD_FIRST_FOLLOW_UP_ESCALATION')
      AND `newer`.`eventType` IN ('LEAD_ACK_ESCALATION', 'LEAD_FIRST_FOLLOW_UP_ESCALATION'))
    OR
    (`older`.`eventType` IN ('TODO_ASSIGNED', 'TODO_DUE_SOON', 'TODO_DUE', 'TODO_OVERDUE')
      AND `newer`.`eventType` IN ('TODO_ASSIGNED', 'TODO_DUE_SOON', 'TODO_DUE', 'TODO_OVERDUE'))
  )
SET
  `older`.`resolvedAt` = CURRENT_TIMESTAMP(3),
  `older`.`resolvedReason` = '已更新为最新业务提醒',
  `older`.`readAt` = COALESCE(`older`.`readAt`, CURRENT_TIMESTAMP(3)),
  `older`.`updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `older`.`resolvedAt` IS NULL;
