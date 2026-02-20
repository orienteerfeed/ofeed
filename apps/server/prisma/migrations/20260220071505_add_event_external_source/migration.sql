/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Event` ADD COLUMN `externalEventId` VARCHAR(128) NULL,
    ADD COLUMN `externalSource` ENUM('ORIS', 'EVENTOR') NULL,
    MODIFY `zeroTime` DATETIME NOT NULL;

-- CreateIndex
CREATE INDEX `Event_externalSource_externalEventId_idx` ON `Event`(`externalSource`, `externalEventId`);
