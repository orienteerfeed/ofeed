-- Entry orders, registration cache, payments, rental cards, and audit trail.
-- This migration consolidates the local-only entry feature development into
-- its final schema. It applies to databases that do not yet contain these
-- features; existing local databases must mark it as applied after their
-- migration history is reconciled.

CREATE TABLE `Club` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `source` ENUM('ORIS', 'EVENTOR') NOT NULL DEFAULT 'ORIS',
    `externalId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `abbr` VARCHAR(20) NOT NULL,
    `region` VARCHAR(64) NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Club_source_external_uq`(`source`, `externalId`),
    INDEX `Club_abbr_idx`(`abbr`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Registration` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `source` ENUM('ORIS', 'EVENTOR') NOT NULL DEFAULT 'ORIS',
    `externalId` VARCHAR(64) NOT NULL,
    `registration` VARCHAR(10) NOT NULL,
    `firstname` VARCHAR(191) NOT NULL,
    `lastname` VARCHAR(191) NOT NULL,
    `birthYear` SMALLINT UNSIGNED NULL,
    `license` CHAR(1) NULL,
    `gender` ENUM('B', 'M', 'F') NULL,
    `clubId` INTEGER UNSIGNED NULL,
    `card` INTEGER UNSIGNED NULL,
    `sport` ENUM('OB', 'LOB', 'MTBO', 'TRAIL') NOT NULL,
    `year` SMALLINT UNSIGNED NOT NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Registration_source_reg_sport_year_uq`(`source`, `registration`, `sport`, `year`),
    INDEX `Registration_source_card_sport_year_idx`(`source`, `card`, `sport`, `year`),
    INDEX `Registration_sport_year_idx`(`sport`, `year`),
    INDEX `Registration_club_idx`(`clubId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RegistrationSyncState` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `source` ENUM('ORIS', 'EVENTOR') NOT NULL,
    `sport` ENUM('OB', 'LOB', 'MTBO', 'TRAIL') NOT NULL,
    `year` SMALLINT UNSIGNED NOT NULL,
    `lastCheckedAt` DATETIME(3) NULL,
    `lastSuccessfulSyncAt` DATETIME(3) NULL,
    `lastStatus` ENUM('PENDING', 'SUCCESS', 'ERROR') NOT NULL DEFAULT 'PENDING',
    `lastError` TEXT NULL,
    `recordCount` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RegistrationSyncState_source_sport_year_uq`(`source`, `sport`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ClubSyncState` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `source` ENUM('ORIS', 'EVENTOR') NOT NULL,
    `lastCheckedAt` DATETIME(3) NULL,
    `lastSuccessfulSyncAt` DATETIME(3) NULL,
    `lastStatus` ENUM('PENDING', 'SUCCESS', 'ERROR') NOT NULL DEFAULT 'PENDING',
    `lastError` TEXT NULL,
    `recordCount` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ClubSyncState_source_key`(`source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Event`
    ADD COLUMN `ofeedPaymentAvailable` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `bankAccountIban` VARCHAR(34) NULL,
    ADD COLUMN `bankAccountName` VARCHAR(191) NULL;

CREATE TABLE `EventPaymentMethod` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `type` ENUM('OFEED_PAYMENT', 'CUSTOM_PAYMENT_LINK', 'QR_PAYMENT', 'CASH') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `position` TINYINT UNSIGNED NOT NULL,
    `displayName` VARCHAR(128) NULL,
    `paymentLinkTemplate` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventPaymentMethod_event_type_uq`(`eventId`, `type`),
    UNIQUE INDEX `EventPaymentMethod_event_position_uq`(`eventId`, `position`),
    INDEX `EventPaymentMethod_event_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EventRentalCard` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `cardNumber` INTEGER UNSIGNED NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `returned` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EventRentalCard_event_idx`(`eventId`),
    UNIQUE INDEX `EventRentalCard_event_card_uq`(`eventId`, `cardNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Entry` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `status` ENUM('RECEIVED', 'APPROVED', 'PROCESSED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'RECEIVED',
    `paid` BOOLEAN NOT NULL DEFAULT false,
    `paymentMethod` ENUM('OFEED_PAYMENT', 'CUSTOM_PAYMENT_LINK', 'QR_PAYMENT', 'CASH') NULL,
    `paymentReference` VARCHAR(10) NOT NULL,
    `userId` INTEGER UNSIGNED NULL,
    `contactEmail` VARCHAR(254) NOT NULL,
    `contactFirstname` VARCHAR(191) NOT NULL,
    `contactLastname` VARCHAR(191) NOT NULL,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Entry_event_payment_reference_uq`(`eventId`, `paymentReference`),
    INDEX `Entry_event_status_idx`(`eventId`, `status`),
    INDEX `Entry_user_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EntryItem` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `entryId` VARCHAR(191) NOT NULL,
    `classId` INTEGER UNSIGNED NOT NULL,
    `firstname` VARCHAR(191) NOT NULL,
    `lastname` VARCHAR(191) NOT NULL,
    `registration` VARCHAR(10) NULL,
    `birthYear` SMALLINT UNSIGNED NULL,
    `organisation` VARCHAR(191) NULL,
    `license` CHAR(1) NULL,
    `note` TEXT NULL,
    `card` INTEGER UNSIGNED NULL,
    `cardRental` BOOLEAN NOT NULL DEFAULT false,
    `startTime` DATETIME(3) NULL,
    `fee` DECIMAL(10, 2) NOT NULL,
    `cardRentalFee` DECIMAL(10, 2) NULL,
    `actionKey` ENUM('NEW_ENTRY', 'CARD_CHANGE', 'NAME_CHANGE', 'CLASS_CHANGE', 'START_TIME_CHANGE') NOT NULL DEFAULT 'NEW_ENTRY',
    `previousValue` JSON NULL,
    `competitorId` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EntryItem_entry_idx`(`entryId`),
    INDEX `EntryItem_class_idx`(`classId`),
    INDEX `EntryItem_competitor_idx`(`competitorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EntryAddOnItem` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `entryId` VARCHAR(191) NOT NULL,
    `serviceId` INTEGER UNSIGNED NOT NULL,
    `quantity` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `price` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EntryAddOnItem_entry_idx`(`entryId`),
    INDEX `EntryAddOnItem_service_idx`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EntryStatusHistory` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `entryId` VARCHAR(191) NOT NULL,
    `status` ENUM('RECEIVED', 'APPROVED', 'PROCESSED', 'REJECTED', 'CANCELLED') NULL,
    `paymentState` BOOLEAN NULL,
    `changedById` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EntryStatusHistory_entry_idx`(`entryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Registration` ADD CONSTRAINT `Registration_clubId_fkey`
    FOREIGN KEY (`clubId`) REFERENCES `Club`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `EventPaymentMethod` ADD CONSTRAINT `EventPaymentMethod_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EventRentalCard` ADD CONSTRAINT `EventRentalCard_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Entry` ADD CONSTRAINT `Entry_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Entry` ADD CONSTRAINT `Entry_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `EntryItem` ADD CONSTRAINT `EntryItem_entryId_fkey`
    FOREIGN KEY (`entryId`) REFERENCES `Entry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EntryItem` ADD CONSTRAINT `EntryItem_classId_fkey`
    FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `EntryItem` ADD CONSTRAINT `EntryItem_competitorId_fkey`
    FOREIGN KEY (`competitorId`) REFERENCES `Competitor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `EntryAddOnItem` ADD CONSTRAINT `EntryAddOnItem_entryId_fkey`
    FOREIGN KEY (`entryId`) REFERENCES `Entry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EntryAddOnItem` ADD CONSTRAINT `EntryAddOnItem_serviceId_fkey`
    FOREIGN KEY (`serviceId`) REFERENCES `EventService`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `EntryStatusHistory` ADD CONSTRAINT `EntryStatusHistory_entryId_fkey`
    FOREIGN KEY (`entryId`) REFERENCES `Entry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EntryStatusHistory` ADD CONSTRAINT `EntryStatusHistory_changedById_fkey`
    FOREIGN KEY (`changedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
