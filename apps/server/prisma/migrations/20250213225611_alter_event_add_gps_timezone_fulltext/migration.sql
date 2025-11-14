/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Event` ADD COLUMN `demo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hundredthPrecision` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'Europe/Prague',
    MODIFY `zeroTime` DATETIME NOT NULL;

-- CreateIndex
CREATE FULLTEXT INDEX `Event_name_organizer_location_idx` ON `Event`(`name`, `organizer`, `location`);
