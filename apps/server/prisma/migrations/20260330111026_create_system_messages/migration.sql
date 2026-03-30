-- CreateTable
CREATE TABLE `SystemMessage` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NULL,
    `message` TEXT NOT NULL,
    `severity` ENUM('INFO', 'WARNING', 'ERROR', 'SUCCESS') NOT NULL DEFAULT 'INFO',
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SystemMessage_publishedAt_expiresAt_idx`(`publishedAt`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
