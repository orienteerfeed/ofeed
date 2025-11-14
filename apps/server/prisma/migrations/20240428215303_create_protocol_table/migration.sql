/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Event` MODIFY `zeroTime` DATETIME NOT NULL;

-- CreateTable
CREATE TABLE `Protocol` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `competitorId` INTEGER UNSIGNED NOT NULL,
    `origin` ENUM('START') NOT NULL,
    `type` ENUM('status_change', 'si_card_change') NOT NULL,
    `previousValue` VARCHAR(32) NOT NULL,
    `newValue` VARCHAR(32) NOT NULL,
    `authorId` INTEGER UNSIGNED NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Protocol` ADD CONSTRAINT `Protocol_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Protocol` ADD CONSTRAINT `Protocol_competitorId_fkey` FOREIGN KEY (`competitorId`) REFERENCES `Competitor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Protocol` ADD CONSTRAINT `Protocol_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
