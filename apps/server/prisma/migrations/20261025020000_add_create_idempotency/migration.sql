CREATE TABLE `IdempotencyResponse` (
    `id` CHAR(64) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `status` SMALLINT UNSIGNED NOT NULL,
    `contentType` VARCHAR(100) NOT NULL,
    `body` LONGTEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    INDEX `IdempotencyResponse_eventId_expiresAt_idx`(`eventId`, `expiresAt`),
    INDEX `IdempotencyResponse_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `IdempotencyResponse` ADD CONSTRAINT `IdempotencyResponse_eventId_fkey`
FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
