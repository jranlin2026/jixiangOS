CREATE INDEX `users_updatedAt_idx` ON `users`(`updatedAt`);
CREATE INDEX `roles_updatedAt_idx` ON `roles`(`updatedAt`);
CREATE INDEX `departments_updatedAt_idx` ON `departments`(`updatedAt`);
CREATE INDEX `app_storage_updatedAt_idx` ON `app_storage`(`updatedAt`);
CREATE INDEX `business_records_domain_updatedAt_idx` ON `business_records`(`domain`, `updatedAt`);
