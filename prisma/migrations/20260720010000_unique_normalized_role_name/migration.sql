-- Keep role names unique under the same trim + lower-case normalization used by
-- the application. If historical duplicates exist, index creation intentionally
-- fails: permission-bearing roles must be resolved explicitly instead of being
-- silently renamed, merged, or deleted by a schema migration.
ALTER TABLE `roles`
  ADD COLUMN `normalizedName` VARCHAR(191) NULL;

UPDATE `roles`
SET `normalizedName` = LOWER(TRIM(`name`));

ALTER TABLE `roles`
  MODIFY `normalizedName` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `roles_normalized_name_key`
  ON `roles`(`normalizedName`);
