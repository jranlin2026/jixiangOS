SET @customer_creation_order_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'business_records'
    AND index_name = 'business_records_domain_createdAt_id_idx'
);

SET @customer_creation_order_index_sql := IF(
  @customer_creation_order_index_exists > 0,
  'SELECT 1',
  'CREATE INDEX `business_records_domain_createdAt_id_idx` ON `business_records`(`domain`, `createdAt`, `id`)'
);

PREPARE customer_creation_order_index_statement FROM @customer_creation_order_index_sql;
EXECUTE customer_creation_order_index_statement;
DEALLOCATE PREPARE customer_creation_order_index_statement;
