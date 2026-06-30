-- CreateTable: configurable services offered by an event
CREATE TABLE `EventService` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `systemKey` ENUM('CARD_CHANGE', 'NAME_CHANGE', 'CLASS_CHANGE', 'START_TIME_CHANGE', 'ENTRY_CANCEL', 'CARD_RENTAL') NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `name` VARCHAR(128) NOT NULL,
    `description` TEXT NULL,
    `price` DECIMAL(10, 2) NULL,
    `maxQuantity` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventService_event_system_uq`(`eventId`, `systemKey`),
    INDEX `EventService_event_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventService` ADD CONSTRAINT `EventService_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
