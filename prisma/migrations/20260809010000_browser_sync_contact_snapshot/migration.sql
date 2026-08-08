ALTER TABLE `browser_lead_syncs`
  ADD COLUMN `contactNickname` VARCHAR(200) NULL,
  ADD COLUMN `contactPhone` VARCHAR(40) NULL,
  ADD COLUMN `contactWechat` VARCHAR(120) NULL;
