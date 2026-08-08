-- Keep the column nullable so this migration can be deployed before application
-- instances that always write an attempt token have fully rolled out.
ALTER TABLE `browser_lead_syncs`
  ADD COLUMN `attemptToken` VARCHAR(64) NULL;

-- Existing rows receive a unique opaque value. Non-PENDING values are inert,
-- while existing PENDING rows cannot accidentally share a future lease token.
UPDATE `browser_lead_syncs`
SET `attemptToken` = UUID()
WHERE `attemptToken` IS NULL;
