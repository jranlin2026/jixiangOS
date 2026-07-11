CREATE TABLE `knowledge_documents` (
  `id` VARCHAR(64) NOT NULL,
  `slug` VARCHAR(160) NOT NULL,
  `title` VARCHAR(240) NOT NULL,
  `category` VARCHAR(120) NOT NULL,
  `summary` TEXT NOT NULL,
  `ownerDepartmentId` VARCHAR(64) NULL,
  `ownerUserId` VARCHAR(64) NULL,
  `sensitivity` VARCHAR(32) NOT NULL DEFAULT 'INTERNAL',
  `currentVersionId` VARCHAR(64) NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `knowledge_documents_slug_key`(`slug`),
  INDEX `knowledge_documents_ownerDepartmentId_idx`(`ownerDepartmentId`),
  INDEX `knowledge_documents_ownerUserId_idx`(`ownerUserId`),
  INDEX `knowledge_documents_currentVersionId_idx`(`currentVersionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_versions` (
  `id` VARCHAR(64) NOT NULL,
  `documentId` VARCHAR(64) NOT NULL,
  `versionNumber` INTEGER NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  `sourceFileName` VARCHAR(255) NOT NULL,
  `sourcePath` VARCHAR(1000) NULL,
  `checksum` VARCHAR(64) NOT NULL,
  `contentText` LONGTEXT NOT NULL,
  `effectiveAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `publishedById` VARCHAR(64) NULL,
  `createdById` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `knowledge_versions_documentId_versionNumber_key`(`documentId`, `versionNumber`),
  INDEX `knowledge_versions_status_idx`(`status`),
  INDEX `knowledge_versions_effectiveAt_expiresAt_idx`(`effectiveAt`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_attachments` (
  `id` VARCHAR(64) NOT NULL, `versionId` VARCHAR(64) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL, `mimeType` VARCHAR(120) NOT NULL,
  `byteSize` INTEGER NOT NULL, `storageKey` VARCHAR(500) NOT NULL,
  `checksum` VARCHAR(64) NOT NULL, `createdById` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `knowledge_attachments_storageKey_key`(`storageKey`),
  INDEX `knowledge_attachments_versionId_idx`(`versionId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_visibilities` (
  `id` VARCHAR(64) NOT NULL, `documentId` VARCHAR(64) NOT NULL,
  `subjectType` VARCHAR(32) NOT NULL, `subjectId` VARCHAR(64) NOT NULL DEFAULT '*',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `knowledge_visibilities_documentId_subjectType_subjectId_key`(`documentId`, `subjectType`, `subjectId`),
  INDEX `knowledge_visibilities_subjectType_subjectId_idx`(`subjectType`, `subjectId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `content_reviews` (
  `id` VARCHAR(64) NOT NULL, `versionId` VARCHAR(64) NOT NULL,
  `reviewerUserId` VARCHAR(64) NOT NULL, `decision` VARCHAR(24) NOT NULL,
  `comment` TEXT NULL, `reviewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `content_reviews_versionId_reviewedAt_idx`(`versionId`, `reviewedAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `knowledge_chunks` (
  `id` VARCHAR(64) NOT NULL, `versionId` VARCHAR(64) NOT NULL,
  `ordinal` INTEGER NOT NULL, `heading` VARCHAR(500) NULL,
  `content` LONGTEXT NOT NULL, `searchText` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `knowledge_chunks_versionId_ordinal_key`(`versionId`, `ordinal`),
  INDEX `knowledge_chunks_versionId_idx`(`versionId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `knowledge_versions` ADD CONSTRAINT `knowledge_versions_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `knowledge_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `knowledge_attachments` ADD CONSTRAINT `knowledge_attachments_versionId_fkey`
  FOREIGN KEY (`versionId`) REFERENCES `knowledge_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `knowledge_visibilities` ADD CONSTRAINT `knowledge_visibilities_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `knowledge_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `content_reviews` ADD CONSTRAINT `content_reviews_versionId_fkey`
  FOREIGN KEY (`versionId`) REFERENCES `knowledge_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `knowledge_chunks` ADD CONSTRAINT `knowledge_chunks_versionId_fkey`
  FOREIGN KEY (`versionId`) REFERENCES `knowledge_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
