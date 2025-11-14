/*
  Warnings:

  - You are about to alter the column `zeroTime` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Event` MODIFY `zeroTime` DATETIME NOT NULL;

-- AlterTable
ALTER TABLE `Protocol` MODIFY `type` ENUM('competitor_create', 'competitor_update', 'status_change', 'si_card_change', 'note_change') NOT NULL;
