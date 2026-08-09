CREATE TABLE `browser_agent_auth_grants` (
  `jti` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(64) NOT NULL,
  `parentSessionId` VARCHAR(64) NOT NULL,
  `deviceId` VARCHAR(128) NOT NULL,
  `redirectUri` VARCHAR(255) NOT NULL,
  `codeChallenge` VARCHAR(100) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`jti`),
  INDEX `browser_agent_auth_grants_userId_expiresAt_idx` (`userId`, `expiresAt`),
  INDEX `browser_agent_auth_grants_parentSessionId_idx` (`parentSessionId`),
  CONSTRAINT `browser_agent_auth_grants_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `browser_agent_sessions` (
  `jti` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(64) NOT NULL,
  `parentSessionId` VARCHAR(64) NOT NULL,
  `deviceId` VARCHAR(128) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`jti`),
  INDEX `browser_agent_sessions_userId_expiresAt_idx` (`userId`, `expiresAt`),
  INDEX `browser_agent_sessions_parentSessionId_idx` (`parentSessionId`),
  CONSTRAINT `browser_agent_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
