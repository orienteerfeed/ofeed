/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Event` ADD COLUMN `featuredImageKey` VARCHAR(512) NULL,
    MODIFY `zeroTime` DATETIME NOT NULL;
