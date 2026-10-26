CREATE UNIQUE INDEX `Entry_event_id_uq` ON `Entry`(`eventId`, `id`);

CREATE TABLE `EntryPayment` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `clientPaymentId` CHAR(36) NOT NULL,
    `method` ENUM('CASH', 'QR') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `paidAt` DATETIME(3) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `operatorId` INTEGER UNSIGNED NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `EntryPayment_event_client_uq`(`eventId`, `clientPaymentId`),
    INDEX `EntryPayment_event_recorded_idx`(`eventId`, `recordedAt`, `id`),
    INDEX `EntryPayment_event_device_recorded_idx`(`eventId`, `deviceId`, `recordedAt`),
    INDEX `EntryPayment_event_entry_idx`(`eventId`, `entryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EntryPayment` ADD CONSTRAINT `EntryPayment_eventId_entryId_fkey`
    FOREIGN KEY (`eventId`, `entryId`) REFERENCES `Entry`(`eventId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
