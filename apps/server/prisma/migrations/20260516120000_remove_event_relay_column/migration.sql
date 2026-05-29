-- Migrate legacy relay flag before removing the column.
UPDATE `Event`
SET `discipline` = 'RELAY'
WHERE `discipline` = 'OTHER' AND `relay` = true;

-- AlterTable
ALTER TABLE `Event` DROP COLUMN `relay`;
