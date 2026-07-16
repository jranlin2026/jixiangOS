SET @business_record_domain_status_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'business_records'
    AND index_name = 'business_records_domain_status_idx'
);

SET @business_record_domain_status_index_sql := IF(
  @business_record_domain_status_index_exists > 0,
  'SELECT 1',
  'CREATE INDEX `business_records_domain_status_idx` ON `business_records`(`domain`, `status`)'
);

PREPARE business_record_domain_status_index_statement FROM @business_record_domain_status_index_sql;
EXECUTE business_record_domain_status_index_statement;
DEALLOCATE PREPARE business_record_domain_status_index_statement;
