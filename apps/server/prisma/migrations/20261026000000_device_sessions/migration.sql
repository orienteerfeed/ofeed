CREATE TABLE `DeviceSession` (
 `id` VARCHAR(36) NOT NULL, `userId` INTEGER UNSIGNED NOT NULL,
 `deviceId` VARCHAR(36) NOT NULL, `deviceName` VARCHAR(100) NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `lastRefreshedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `expiresAt` DATETIME(3) NOT NULL, `absoluteExpiresAt` DATETIME(3) NOT NULL,
 `revokedAt` DATETIME(3) NULL, `revocationReason` VARCHAR(32) NULL,
 PRIMARY KEY (`id`), INDEX `DeviceSession_userId_deviceId_idx` (`userId`, `deviceId`),
 INDEX `DeviceSession_absoluteExpiresAt_idx` (`absoluteExpiresAt`),
 CONSTRAINT `DeviceSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `SessionRefreshToken` (
 `id` VARCHAR(36) NOT NULL, `familyId` VARCHAR(36) NOT NULL, `tokenHash` CHAR(64) NOT NULL,
 `generation` INTEGER NOT NULL, `consumedAt` DATETIME(3) NULL, `replacementId` VARCHAR(36) NULL,
 PRIMARY KEY (`id`), UNIQUE INDEX `SessionRefreshToken_tokenHash_key` (`tokenHash`),
 UNIQUE INDEX `SessionRefreshToken_familyId_generation_key` (`familyId`, `generation`),
 CONSTRAINT `SessionRefreshToken_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `DeviceSession` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
