-- AlterTable
ALTER TABLE `Event`
    ADD COLUMN `entriesOpenAt` DATETIME(3) NULL,
    ADD COLUMN `entriesCloseAt` DATETIME(3) NULL,
    ADD COLUMN `resultsOfficialAt` DATETIME(3) NULL,
    ADD COLUMN `resultsOfficialManuallySetAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `EventExternalResultsSyncState` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `provider` ENUM('ORIS', 'EVENTOR') NOT NULL,
    `lastCheckedAt` DATETIME(3) NULL,
    `lastSuccessfulCheckAt` DATETIME(3) NULL,
    `lastDetectedOfficialAt` DATETIME(3) NULL,
    `lastStatus` ENUM('PENDING', 'OFFICIAL', 'NOT_FOUND', 'ERROR') NOT NULL DEFAULT 'PENDING',
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventExternalResultsSyncState_eventId_key`(`eventId`),
    INDEX `EventExternalResultsSyncState_provider_lastStatus_idx`(`provider`, `lastStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventExternalResultsSyncState`
    ADD CONSTRAINT `EventExternalResultsSyncState_eventId_fkey`
        FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`)
            ON DELETE CASCADE ON UPDATE CASCADE;
