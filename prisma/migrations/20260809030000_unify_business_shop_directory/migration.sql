ALTER TABLE `browser_shop_bindings`
  ADD COLUMN `businessPlatformId` VARCHAR(64) NULL,
  ADD COLUMN `businessShopId` VARCHAR(64) NULL;

CREATE UNIQUE INDEX `browser_shop_bindings_businessShopId_key`
  ON `browser_shop_bindings`(`businessShopId`);
