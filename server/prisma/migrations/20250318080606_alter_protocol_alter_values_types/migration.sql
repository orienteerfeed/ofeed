/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Event` MODIFY `zeroTime` DATETIME NOT NULL;

-- AlterTable
ALTER TABLE `Protocol` MODIFY `previousValue` VARCHAR(191) NULL,
    MODIFY `newValue` VARCHAR(191) NOT NULL;
