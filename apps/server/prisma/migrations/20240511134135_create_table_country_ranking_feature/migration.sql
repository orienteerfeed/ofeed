/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Event` ADD COLUMN `coefRanking` DOUBLE NULL,
    ADD COLUMN `countryId` CHAR(2) NULL,
    ADD COLUMN `ranking` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `startMode` ENUM('Individual', 'Mass', 'Handicap', 'Pursuit', 'Wave', 'ScoreO') NOT NULL DEFAULT 'Individual',
    MODIFY `zeroTime` DATETIME NOT NULL;

-- CreateTable
CREATE TABLE `Country` (
    `countryCode` CHAR(2) NOT NULL,
    `countryName` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`countryCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RankingCzech` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `place` INTEGER NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `registration` VARCHAR(10) NOT NULL,
    `points` INTEGER NOT NULL,
    `rankIndex` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RankingCzech_registration_key`(`registration`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_countryId_fkey` FOREIGN KEY (`countryId`) REFERENCES `Country`(`countryCode`) ON DELETE SET NULL ON UPDATE CASCADE;
