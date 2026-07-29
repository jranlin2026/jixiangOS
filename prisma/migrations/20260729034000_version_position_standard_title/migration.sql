ALTER TABLE `position_standard_versions` ADD COLUMN `title` VARCHAR(200) NULL AFTER `status`;
UPDATE `position_standard_versions` AS `v`
JOIN `position_standards` AS `s` ON `s`.`id` = `v`.`standardId`
SET `v`.`title` = `s`.`title`;
ALTER TABLE `position_standard_versions` MODIFY COLUMN `title` VARCHAR(200) NOT NULL;
