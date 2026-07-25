DROP TEMPORARY TABLE IF EXISTS `business_import_job_item_row_repair_map`;

CREATE TEMPORARY TABLE `business_import_job_item_row_repair_map` (
  `itemId` VARCHAR(64) NOT NULL,
  `jobId` VARCHAR(64) NOT NULL,
  `oldRowNumber` INTEGER NOT NULL,
  `newRowNumber` INTEGER NOT NULL,
  `oldRowCount` INTEGER NOT NULL,
  PRIMARY KEY (`itemId`),
  UNIQUE INDEX `business_import_job_item_row_repair_job_row_uq` (`jobId`, `newRowNumber`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `business_import_job_item_row_repair_map`
  (`itemId`, `jobId`, `oldRowNumber`, `newRowNumber`, `oldRowCount`)
WITH
digits AS (
  SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
),
candidates AS (
  SELECT 2 + ones.n + tens.n * 10 + hundreds.n * 100 + thousands.n * 1000 AS rowNumber
  FROM digits ones
  CROSS JOIN digits tens
  CROSS JOIN digits hundreds
  CROSS JOIN digits thousands
  WHERE 2 + ones.n + tens.n * 10 + hundreds.n * 100 + thousands.n * 1000 <= 5001
),
ranked_items AS (
  SELECT i.*,
    COUNT(*) OVER (PARTITION BY i.`jobId`, i.`rowNumber`) AS oldRowCount,
    ROW_NUMBER() OVER (
      PARTITION BY i.`jobId`, i.`rowNumber`
      ORDER BY i.`createdAt`, i.`id`
    ) AS duplicateOrdinal
  FROM `business_import_job_items` i
),
invalid_items AS (
  SELECT ranked_items.*,
    ROW_NUMBER() OVER (
      PARTITION BY ranked_items.`jobId`
      ORDER BY ranked_items.`rowNumber`, ranked_items.`createdAt`, ranked_items.`id`
    ) AS repairOrdinal
  FROM ranked_items
  WHERE ranked_items.`rowNumber` < 2
     OR ranked_items.`rowNumber` > 1048576
     OR ranked_items.duplicateOrdinal > 1
),
repair_jobs AS (
  SELECT DISTINCT `jobId` FROM invalid_items
),
available_rows AS (
  SELECT repair_jobs.`jobId`, candidates.rowNumber,
    ROW_NUMBER() OVER (PARTITION BY repair_jobs.`jobId` ORDER BY candidates.rowNumber) AS availableOrdinal
  FROM repair_jobs
  CROSS JOIN candidates
  LEFT JOIN `business_import_job_items` existing
    ON existing.`jobId` = repair_jobs.`jobId`
   AND existing.`rowNumber` = candidates.rowNumber
  WHERE existing.`id` IS NULL
)
SELECT invalid_items.`id`, invalid_items.`jobId`, invalid_items.`rowNumber`, available_rows.rowNumber, invalid_items.oldRowCount
FROM invalid_items
JOIN available_rows
  ON available_rows.`jobId` = invalid_items.`jobId`
 AND available_rows.availableOrdinal = invalid_items.repairOrdinal;

UPDATE `business_import_number_reservations` r
JOIN `business_import_job_item_row_repair_map` m
  ON m.`jobId` = r.`jobId`
 AND m.`oldRowNumber` = r.`rowNumber`
JOIN `business_import_job_items` i
  ON i.`id` = m.`itemId`
 AND i.`reservedNumber` = r.`normalizedNumber`
SET r.`rowNumber` = m.`newRowNumber`;

UPDATE `business_records` br
JOIN `business_import_jobs` j
  ON j.`batchId` = JSON_UNQUOTE(JSON_EXTRACT(br.`data`, '$.importBatchId'))
JOIN `business_import_job_item_row_repair_map` m
  ON m.`jobId` = j.`id`
 AND m.`oldRowNumber` = CAST(JSON_UNQUOTE(JSON_EXTRACT(br.`data`, '$.importRowNumber')) AS SIGNED)
JOIN `business_import_job_items` i ON i.`id` = m.`itemId`
SET br.`data` = JSON_SET(br.`data`, '$.importRowNumber', m.`newRowNumber`),
    br.`updatedAt` = NOW(3)
WHERE br.`domain` IN ('aaos_order_applications', 'aaos_recovery_orders')
  AND (m.`oldRowCount` = 1 OR (i.`recordId` IS NOT NULL AND br.`recordId` = i.`recordId`));

UPDATE `business_import_job_items` i
JOIN `business_import_job_item_row_repair_map` m ON m.`itemId` = i.`id`
SET i.`rowNumber` = m.`newRowNumber`,
    i.`payload` = JSON_SET(i.`payload`, '$.rowNumber', m.`newRowNumber`, '$.normalized.rowNumber', m.`newRowNumber`),
    i.`updatedAt` = NOW(3);

DELETE r
FROM `business_import_number_reservations` r
JOIN `business_import_jobs` j ON j.`id` = r.`jobId`
JOIN `business_import_job_items` i
  ON i.`jobId` = r.`jobId`
 AND i.`rowNumber` = r.`rowNumber`
 AND i.`reservedNumber` = r.`normalizedNumber`
JOIN `business_import_job_item_row_repair_map` m ON m.`itemId` = i.`id`
WHERE j.`status` IN ('succeeded', 'partial_failed', 'failed')
  AND i.`status` = 'failed'
  AND (m.`oldRowCount` = 1 OR i.`recordId` IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM `business_records` br
    WHERE br.`domain` IN ('aaos_order_applications', 'aaos_recovery_orders')
      AND (
        (i.`recordId` IS NOT NULL AND br.`recordId` = i.`recordId`)
        OR (
          JSON_UNQUOTE(JSON_EXTRACT(br.`data`, '$.importBatchId')) = j.`batchId`
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(br.`data`, '$.importRowNumber')) AS UNSIGNED) = i.`rowNumber`
        )
      )
  );

DROP TEMPORARY TABLE `business_import_job_item_row_repair_map`;
