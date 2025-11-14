/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Event` MODIFY `zeroTime` DATETIME NOT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `organisation` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Split` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `competitorId` INTEGER UNSIGNED NOT NULL,
    `controlCode` INTEGER NOT NULL,
    `time` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Split` ADD CONSTRAINT `Split_competitorId_fkey` FOREIGN KEY (`competitorId`) REFERENCES `Competitor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
