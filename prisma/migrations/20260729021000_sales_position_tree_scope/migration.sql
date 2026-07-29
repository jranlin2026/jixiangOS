UPDATE `positions`
SET `departmentScope` = 'DEPARTMENT_TREE'
WHERE `departmentId` = 'dept-sales'
  AND `code` IN ('sales_manager', 'sales_consultant');
