/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Event` MODIFY `zeroTime` DATETIME NOT NULL;

-- CreateTable
CREATE TABLE `EventPassword` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthClient` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(255) NOT NULL,
    `clientSecret` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` INTEGER UNSIGNED NOT NULL,

    UNIQUE INDEX `OAuthClient_clientId_key`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthGrant` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `grantType` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthScope` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthRedirectUri` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `uri` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthAccessToken` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(1024) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NULL,
    `expiresAt` DATETIME(3) NOT NULL,


    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthAuthorizationCode` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(255) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `redirectUri` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `OAuthAuthorizationCode_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthRefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(1024) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventPassword` ADD CONSTRAINT `EventPassword_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthClient` ADD CONSTRAINT `OAuthClient_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthGrant` ADD CONSTRAINT `OAuthGrant_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthScope` ADD CONSTRAINT `OAuthScope_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthRedirectUri` ADD CONSTRAINT `OAuthRedirectUri_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAccessToken` ADD CONSTRAINT `OAuthAccessToken_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAccessToken` ADD CONSTRAINT `OAuthAccessToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAuthorizationCode` ADD CONSTRAINT `OAuthAuthorizationCode_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAuthorizationCode` ADD CONSTRAINT `OAuthAuthorizationCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthRefreshToken` ADD CONSTRAINT `OAuthRefreshToken_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthRefreshToken` ADD CONSTRAINT `OAuthRefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
