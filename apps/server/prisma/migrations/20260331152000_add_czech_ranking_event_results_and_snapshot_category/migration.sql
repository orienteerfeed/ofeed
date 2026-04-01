ALTER TABLE `RankingCzech`
    DROP INDEX `RankingCzech_registration_rankingType_validForMonth_key`,
    DROP INDEX `RankingCzech_rankingType_validForMonth_idx`,
    ADD COLUMN `rankingCategory` ENUM('M', 'F') NOT NULL DEFAULT 'M' AFTER `rankingType`;

CREATE INDEX `ranking_czech_type_cat_month_idx`
    ON `RankingCzech`(`rankingType`, `rankingCategory`, `validForMonth`);

CREATE UNIQUE INDEX `ranking_czech_reg_type_cat_month_uq`
    ON `RankingCzech`(`registration`, `rankingType`, `rankingCategory`, `validForMonth`);

ALTER TABLE `RankingCzech`
    ALTER COLUMN `rankingCategory` DROP DEFAULT;

CREATE TABLE `CzechRankingEventResult` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `externalEventId` VARCHAR(128) NOT NULL,
    `eventDate` DATE NOT NULL,
    `rankingType` ENUM('FOREST', 'SPRINT') NOT NULL,
    `rankingCategory` ENUM('M', 'F') NOT NULL,
    `classExternalId` VARCHAR(64) NULL,
    `className` VARCHAR(32) NOT NULL,
    `competitorName` VARCHAR(191) NULL,
    `registration` VARCHAR(10) NOT NULL,
    `place` INTEGER UNSIGNED NULL,
    `time` VARCHAR(16) NULL,
    `rankingPoints` INTEGER UNSIGNED NOT NULL,
    `rankingReferenceValue` INTEGER UNSIGNED NULL,
    `orisResultId` VARCHAR(64) NULL,
    `orisUserId` VARCHAR(64) NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CzechRankingEventResult_orisResultId_key`(`orisResultId`),
    UNIQUE INDEX `czech_rank_event_ext_type_reg_class_uq`(`externalEventId`, `rankingType`, `registration`, `className`),
    INDEX `CzechRankingEventResult_rankingType_eventDate_idx`(`rankingType`, `eventDate`),
    INDEX `CzechRankingEventResult_registration_rankingType_eventDate_idx`(`registration`, `rankingType`, `eventDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
