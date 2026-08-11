ALTER TABLE `academy_courses`
  ADD COLUMN `targetAudience` TEXT NULL,
  ADD COLUMN `customerProblem` TEXT NULL,
  ADD COLUMN `coreViewpoint` TEXT NULL,
  ADD COLUMN `conversionProductId` VARCHAR(64) NULL,
  ADD COLUMN `conversionProductName` VARCHAR(200) NULL,
  ADD COLUMN `lecturerUserId` VARCHAR(64) NULL,
  ADD COLUMN `lecturerUserName` VARCHAR(100) NULL;

ALTER TABLE `academy_course_versions`
  ADD COLUMN `targetAudience` TEXT NULL,
  ADD COLUMN `customerProblem` TEXT NULL,
  ADD COLUMN `coreViewpoint` TEXT NULL,
  ADD COLUMN `conversionProductId` VARCHAR(64) NULL,
  ADD COLUMN `conversionProductName` VARCHAR(200) NULL;
