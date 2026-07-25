INSERT INTO `business_import_job_items`
  (`id`, `jobId`, `rowNumber`, `status`, `payload`, `reservedNumber`, `recordId`, `errorMessage`, `createdAt`, `updatedAt`)
WITH parsed AS (
  SELECT
    j.`id` AS `jobId`,
    j.`createdAt`,
    j.`startedAt`,
    j.`finishedAt`,
    jt.*,
    JSON_EXTRACT(j.`rows`, CONCAT('$[', jt.`ordinality` - 1, ']')) AS `payload`,
    ROW_NUMBER() OVER (
      PARTITION BY j.`id`, jt.`originalRowNumber`
      ORDER BY jt.`ordinality`
    ) AS `duplicateOrdinal`
  FROM `business_import_jobs` j
  JOIN JSON_TABLE(j.`rows`, '$[*]' COLUMNS(
    `ordinality` FOR ORDINALITY,
    `originalRowNumber` BIGINT PATH '$.rowNumber' NULL ON EMPTY NULL ON ERROR,
    `executionStatus` VARCHAR(32) PATH '$.executionStatus' NULL ON EMPTY,
    `precheckStatus` VARCHAR(32) PATH '$.status' NULL ON EMPTY,
    `thirdPartyOrderNo` VARCHAR(191) PATH '$.normalized.thirdPartyOrderNo' NULL ON EMPTY,
    `recordId` VARCHAR(80) PATH '$.recordId' NULL ON EMPTY,
    `errorMessage` VARCHAR(1000) PATH '$.errorMessage' NULL ON EMPTY
  )) jt
), assessed AS (
  SELECT
    parsed.*,
    MAX(CASE
      WHEN `originalRowNumber` IS NULL OR `originalRowNumber` < 2 OR `originalRowNumber` > 1048576 OR `duplicateOrdinal` > 1 THEN 1
      ELSE 0
    END) OVER (PARTITION BY `jobId`) AS `requiresRenumber`
  FROM parsed
), numbered AS (
  SELECT
    assessed.*,
    CASE
      WHEN `requiresRenumber` = 1 THEN `ordinality` + 1
      ELSE `originalRowNumber`
    END AS `assignedRowNumber`
  FROM assessed
)
SELECT
  CONCAT('bir-', LEFT(SHA2(CONCAT(`jobId`, ':', `assignedRowNumber`), 256), 40)),
  `jobId`,
  `assignedRowNumber`,
  CASE
    WHEN `executionStatus` IN ('queued', 'running', 'succeeded', 'failed') THEN `executionStatus`
    WHEN `precheckStatus` = 'blocked' THEN 'failed'
    ELSE 'queued'
  END,
  JSON_SET(`payload`, '$.rowNumber', `assignedRowNumber`, '$.normalized.rowNumber', `assignedRowNumber`),
  NULLIF(LOWER(TRIM(`thirdPartyOrderNo`)), ''),
  NULLIF(`recordId`, ''),
  NULLIF(`errorMessage`, ''),
  `createdAt`,
  COALESCE(`finishedAt`, `startedAt`, `createdAt`)
FROM numbered
WHERE NOT EXISTS (
  SELECT 1
  FROM `business_import_job_items` existing
  WHERE existing.`jobId` = numbered.`jobId`
    AND existing.`rowNumber` = numbered.`assignedRowNumber`
);

UPDATE `business_import_number_reservations` r
JOIN (
  SELECT `jobId`, `reservedNumber`, MIN(`rowNumber`) AS `rowNumber`
  FROM `business_import_job_items`
  WHERE `reservedNumber` IS NOT NULL
  GROUP BY `jobId`, `reservedNumber`
) i ON i.`jobId` = r.`jobId` AND i.`reservedNumber` = r.`normalizedNumber`
SET r.`rowNumber` = i.`rowNumber`
WHERE r.`jobId` IS NOT NULL;

DELETE r
FROM `business_import_number_reservations` r
JOIN `business_import_jobs` j ON j.`id` = r.`jobId`
JOIN `business_import_job_items` i
  ON i.`jobId` = r.`jobId`
  AND i.`rowNumber` = r.`rowNumber`
  AND i.`reservedNumber` = r.`normalizedNumber`
WHERE j.`status` IN ('succeeded', 'partial_failed', 'failed')
  AND i.`status` = 'failed'
  AND NOT EXISTS (
    SELECT 1
    FROM `business_records` br
    WHERE br.`domain` IN ('aaos_order_applications', 'aaos_recovery_orders')
      AND JSON_UNQUOTE(JSON_EXTRACT(br.`data`, '$.importBatchId')) = j.`batchId`
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(br.`data`, '$.importRowNumber')) AS UNSIGNED) = i.`rowNumber`
  );
