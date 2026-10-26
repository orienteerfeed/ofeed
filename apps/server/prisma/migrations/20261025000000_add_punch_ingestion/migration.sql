-- Matching timing cards is event-scoped through their class.
CREATE INDEX `Competitor_card_class_idx` ON `Competitor`(`card`, `classId`);

-- AlterTable
ALTER TABLE `Protocol` MODIFY `type` ENUM('competitor_create', 'competitor_update', 'class_change', 'firstname_change', 'lastname_change', 'bibNumber_change', 'nationality_change', 'registration_change', 'license_change', 'ranking_change', 'rank_points_avg_change', 'ranking_points_change', 'ranking_reference_value_change', 'organisation_change', 'short_name_change', 'si_card_change', 'start_time_change', 'finish_time_change', 'time_change', 'team_change', 'leg_change', 'status_change', 'late_start_change', 'note_change', 'external_id_change', 'punch_store') NOT NULL;

-- CreateTable
CREATE TABLE `Punch` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `card` INTEGER UNSIGNED NOT NULL,
    `controlCode` INTEGER NOT NULL,
    `punchTime` DATETIME(3) NOT NULL,
    `competitorId` INTEGER UNSIGNED NULL,
    `splitId` INTEGER UNSIGNED NULL,
    `appliedSource` ENUM('SRR', 'READOUT') NULL,
    `superseded` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `Punch_splitId_key`(`splitId`),
    INDEX `Punch_matching_idx`(`eventId`, `card`, `competitorId`),
    INDEX `Punch_competitorId_idx`(`competitorId`),
    UNIQUE INDEX `Punch_physical_uq`(`eventId`, `card`, `controlCode`, `punchTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PunchReceipt` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    `clientPunchId` CHAR(36) NOT NULL,
    `source` ENUM('SRR', 'READOUT') NOT NULL,
    `punchId` INTEGER UNSIGNED NOT NULL,
    `stationSerial` INTEGER UNSIGNED NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `storedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `authorId` INTEGER UNSIGNED NOT NULL,

    INDEX `PunchReceipt_punchId_idx`(`punchId`),
    UNIQUE INDEX `PunchReceipt_retry_uq`(`eventId`, `deviceId`, `clientPunchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Punch` ADD CONSTRAINT `Punch_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Punch` ADD CONSTRAINT `Punch_competitorId_fkey` FOREIGN KEY (`competitorId`) REFERENCES `Competitor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Punch` ADD CONSTRAINT `Punch_splitId_fkey` FOREIGN KEY (`splitId`) REFERENCES `Split`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PunchReceipt` ADD CONSTRAINT `PunchReceipt_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PunchReceipt` ADD CONSTRAINT `PunchReceipt_punchId_fkey` FOREIGN KEY (`punchId`) REFERENCES `Punch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PunchReceipt` ADD CONSTRAINT `PunchReceipt_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

