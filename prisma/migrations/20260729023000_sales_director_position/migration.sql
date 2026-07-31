INSERT INTO `positions` (
  `id`,
  `name`,
  `code`,
  `departmentId`,
  `departmentScope`,
  `description`,
  `sortOrder`,
  `isActive`,
  `createdAt`,
  `updatedAt`
)
SELECT
  'pos-sales-director',
  '销售总监',
  'sales_director',
  'dept-sales',
  'DEPARTMENT_TREE',
  '销售体系建设、目标管理和团队经营',
  3,
  TRUE,
  NOW(),
  NOW()
FROM DUAL
WHERE EXISTS (
  SELECT 1 FROM `departments` WHERE `id` = 'dept-sales'
)
AND NOT EXISTS (
  SELECT 1 FROM `positions`
  WHERE `id` = 'pos-sales-director' OR `code` = 'sales_director'
);
