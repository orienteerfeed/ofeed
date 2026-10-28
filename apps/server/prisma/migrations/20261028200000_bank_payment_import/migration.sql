-- AlterTable
ALTER TABLE `EntryPayment` ADD COLUMN `bankTransactionId` VARCHAR(191) NULL,
    ADD COLUMN `source` ENUM('MANUAL', 'BANK_IMPORT') NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE `BankConnection` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` INTEGER UNSIGNED NOT NULL,
    `provider` ENUM('FIO') NOT NULL,
    `mode` ENUM('LIVE', 'TEST') NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `accountIdentifier` VARCHAR(34) NOT NULL,
    `variableSymbolPrefix` VARCHAR(10) NOT NULL,
    `prefixEffectiveFrom` DATE NOT NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    `collectorDeviceId` VARCHAR(36) NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `lastSuccessfulSyncAt` DATETIME(3) NULL,
    `lastRelevantAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `BankConnection_owner_account_uq`(`ownerId`, `provider`, `accountIdentifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `providerTransactionId` VARCHAR(32) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `variableSymbol` VARCHAR(10) NOT NULL,
    `bookingDate` DATE NOT NULL,
    `source` ENUM('BANK_API', 'SIMULATED') NOT NULL,
    `trust` ENUM('CLIENT_REPORTED') NOT NULL DEFAULT 'CLIENT_REPORTED',
    `matchingStatus` ENUM('MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'PARTIALLY_PAID', 'OVERPAID', 'IGNORED') NOT NULL,
    `matchedEntryId` VARCHAR(191) NULL,
    `matchedAmount` DECIMAL(14, 2) NULL,
    `reportedByDeviceId` VARCHAR(36) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BankTransaction_connection_received_idx`(`connectionId`, `receivedAt`, `id`),
    INDEX `BankTransaction_vs_status_idx`(`variableSymbol`, `matchingStatus`),
    INDEX `BankTransaction_matched_entry_idx`(`matchedEntryId`),
    UNIQUE INDEX `BankTransaction_connection_provider_uq`(`connectionId`, `providerTransactionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankSyncLog` (
    `id` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(36) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NOT NULL,
    `status` ENUM('OK', 'ERROR') NOT NULL,
    `fetchedCount` INTEGER UNSIGNED NOT NULL,
    `relevantCount` INTEGER UNSIGNED NOT NULL,
    `matchedCount` INTEGER UNSIGNED NOT NULL,
    `errorCode` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BankSyncLog_connection_started_idx`(`connectionId`, `startedAt`),
    INDEX `BankSyncLog_created_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `EntryPayment_bankTransactionId_key` ON `EntryPayment`(`bankTransactionId`);

-- AddForeignKey
ALTER TABLE `EntryPayment` ADD CONSTRAINT `EntryPayment_bankTransactionId_fkey` FOREIGN KEY (`bankTransactionId`) REFERENCES `BankTransaction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankConnection` ADD CONSTRAINT `BankConnection_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankTransaction` ADD CONSTRAINT `BankTransaction_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `BankConnection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankTransaction` ADD CONSTRAINT `BankTransaction_matchedEntryId_fkey` FOREIGN KEY (`matchedEntryId`) REFERENCES `Entry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankSyncLog` ADD CONSTRAINT `BankSyncLog_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `BankConnection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

