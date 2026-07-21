-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` VARCHAR(500) NULL,
    `parentId` VARCHAR(64) NULL,
    `managerId` VARCHAR(64) NULL,
    `memberCount` INTEGER NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_code_key`(`code`),
    INDEX `departments_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `positions` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `departmentId` VARCHAR(64) NULL,
    `description` VARCHAR(500) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `positions_code_key`(`code`),
    INDEX `positions_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` VARCHAR(500) NULL,
    `departmentId` VARCHAR(64) NULL,
    `permissions` JSON NOT NULL,
    `dataScopes` JSON NULL,
    `memberCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_code_key`(`code`),
    INDEX `roles_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `account` VARCHAR(100) NULL,
    `email` VARCHAR(200) NOT NULL,
    `phone` VARCHAR(50) NOT NULL,
    `role` VARCHAR(100) NOT NULL,
    `avatar` VARCHAR(500) NULL,
    `departmentId` VARCHAR(64) NULL,
    `positionId` VARCHAR(64) NULL,
    `positionName` VARCHAR(100) NULL,
    `roleId` VARCHAR(64) NULL,
    `passwordHash` VARCHAR(100) NULL,
    `passwordSalt` VARCHAR(100) NULL,
    `passwordUpdatedAt` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `employmentStatus` VARCHAR(20) NOT NULL DEFAULT 'active',
    `leftAt` DATETIME(3) NULL,
    `leftBy` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_account_key`(`account`),
    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_departmentId_idx`(`departmentId`),
    INDEX `users_roleId_idx`(`roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` VARCHAR(64) NOT NULL,
    `token` VARCHAR(120) NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `remember` BOOLEAN NOT NULL DEFAULT false,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_sessions_token_key`(`token`),
    INDEX `auth_sessions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_storage` (
    `key` VARCHAR(120) NOT NULL,
    `value` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_provider_configs` (
    `id` VARCHAR(32) NOT NULL DEFAULT 'default',
    `provider` VARCHAR(40) NOT NULL DEFAULT 'deepseek',
    `apiKey` TEXT NOT NULL,
    `baseUrl` VARCHAR(255) NOT NULL DEFAULT 'https://api.deepseek.com',
    `model` VARCHAR(100) NOT NULL DEFAULT 'deepseek-chat',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_records` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `company` VARCHAR(200) NULL,
    `phone` VARCHAR(50) NULL,
    `wechat` VARCHAR(100) NULL,
    `source` VARCHAR(120) NULL,
    `status` VARCHAR(50) NULL,
    `lifecycleStatusCode` VARCHAR(80) NULL,
    `owner` VARCHAR(100) NULL,
    `assignedTo` VARCHAR(100) NULL,
    `inputBy` VARCHAR(100) NULL,
    `leadContributorId` VARCHAR(64) NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lead_records_phone_idx`(`phone`),
    INDEX `lead_records_owner_idx`(`owner`),
    INDEX `lead_records_assignedTo_idx`(`assignedTo`),
    INDEX `lead_records_status_idx`(`status`),
    INDEX `lead_records_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_records` (
    `id` VARCHAR(160) NOT NULL,
    `domain` VARCHAR(80) NOT NULL,
    `recordId` VARCHAR(80) NOT NULL,
    `title` VARCHAR(240) NULL,
    `status` VARCHAR(80) NULL,
    `owner` VARCHAR(120) NULL,
    `customerId` VARCHAR(80) NULL,
    `orderId` VARCHAR(80) NULL,
    `amount` DECIMAL(14, 2) NULL,
    `eventAt` DATETIME(3) NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `business_records_domain_idx`(`domain`),
    INDEX `business_records_status_idx`(`status`),
    INDEX `business_records_owner_idx`(`owner`),
    INDEX `business_records_customerId_idx`(`customerId`),
    INDEX `business_records_orderId_idx`(`orderId`),
    INDEX `business_records_eventAt_idx`(`eventAt`),
    UNIQUE INDEX `business_records_domain_recordId_key`(`domain`, `recordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
