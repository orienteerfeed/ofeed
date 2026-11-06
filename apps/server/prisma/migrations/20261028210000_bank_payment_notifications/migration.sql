-- AlterTable
ALTER TABLE `User` ADD COLUMN `bankPushStatuses` JSON NULL;

-- CreateTable
CREATE TABLE `PushDevice` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `deviceId` VARCHAR(36) NOT NULL,
    `expoPushToken` VARCHAR(255) NOT NULL,
    `platform` ENUM('IOS', 'ANDROID') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PushDevice_expoPushToken_key`(`expoPushToken`),
    UNIQUE INDEX `PushDevice_user_device_uq`(`userId`, `deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankPaymentNotification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `bankTransactionId` VARCHAR(191) NOT NULL,
    `matchingStatus` ENUM('MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'PARTIALLY_PAID', 'OVERPAID', 'IGNORED') NOT NULL,
    `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `claimedUntil` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `lastErrorCode` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BankPaymentNotification_pending_idx`(`sentAt`, `attempts`, `claimedUntil`),
    INDEX `BankPaymentNotification_created_idx`(`createdAt`),
    INDEX `BankPaymentNotification_user_idx`(`userId`),
    UNIQUE INDEX `BankPaymentNotification_tx_status_uq`(`bankTransactionId`, `matchingStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PushDevice` ADD CONSTRAINT `PushDevice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankPaymentNotification` ADD CONSTRAINT `BankPaymentNotification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankPaymentNotification` ADD CONSTRAINT `BankPaymentNotification_bankTransactionId_fkey` FOREIGN KEY (`bankTransactionId`) REFERENCES `BankTransaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

