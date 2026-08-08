CREATE TABLE `browser_shop_bindings` (
  `id` VARCHAR(64) NOT NULL,
  `platform` VARCHAR(40) NOT NULL,
  `shopKey` VARCHAR(120) NOT NULL,
  `platformShopId` VARCHAR(160) NULL,
  `displayName` VARCHAR(160) NOT NULL,
  `aliases` JSON NOT NULL,
  `source` VARCHAR(80) NOT NULL DEFAULT '抖音电商',
  `sourceName` VARCHAR(80) NOT NULL DEFAULT '飞鸽客服',
  `sourceType` VARCHAR(40) NOT NULL DEFAULT '公司资源',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdById` VARCHAR(64) NOT NULL,
  `createdByName` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `browser_shop_bindings_platform_shopKey_key` (`platform`, `shopKey`),
  INDEX `browser_shop_bindings_platform_platformShopId_idx` (`platform`, `platformShopId`),
  INDEX `browser_shop_bindings_active_updatedAt_idx` (`active`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `browser_product_mappings` (
  `id` VARCHAR(64) NOT NULL,
  `shopBindingId` VARCHAR(64) NOT NULL,
  `platformIdentityKey` VARCHAR(300) NOT NULL,
  `platformProductId` VARCHAR(200) NULL,
  `platformSkuId` VARCHAR(200) NULL,
  `platformProductName` VARCHAR(500) NOT NULL,
  `aliases` JSON NOT NULL,
  `osProductId` VARCHAR(64) NOT NULL,
  `osProductName` VARCHAR(200) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `confirmedById` VARCHAR(64) NOT NULL,
  `confirmedByName` VARCHAR(100) NOT NULL,
  `confirmedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `browser_product_mappings_shopBindingId_platformIdentityKey_key` (`shopBindingId`, `platformIdentityKey`),
  INDEX `browser_product_mappings_shopBindingId_active_updatedAt_idx` (`shopBindingId`, `active`, `updatedAt`),
  INDEX `browser_product_mappings_osProductId_idx` (`osProductId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `browser_product_mappings_shopBindingId_fkey`
    FOREIGN KEY (`shopBindingId`) REFERENCES `browser_shop_bindings` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `browser_lead_syncs`
  ADD COLUMN `shopBindingId` VARCHAR(64) NULL,
  ADD COLUMN `shopDisplayName` VARCHAR(160) NULL,
  ADD COLUMN `platformProductId` VARCHAR(200) NULL,
  ADD COLUMN `platformSkuId` VARCHAR(200) NULL,
  ADD COLUMN `matchedProductId` VARCHAR(64) NULL,
  ADD COLUMN `matchedProductName` VARCHAR(200) NULL,
  ADD COLUMN `productMatchMethod` VARCHAR(40) NULL,
  ADD COLUMN `sourcePaymentAmount` DECIMAL(14, 2) NULL,
  ADD COLUMN `sourcePaymentAt` DATETIME(3) NULL;

CREATE INDEX `browser_lead_syncs_shopBindingId_idx` ON `browser_lead_syncs`(`shopBindingId`);
CREATE INDEX `browser_lead_syncs_matchedProductId_idx` ON `browser_lead_syncs`(`matchedProductId`);
