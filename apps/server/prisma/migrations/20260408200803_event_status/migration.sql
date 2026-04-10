-- DropForeignKey
ALTER TABLE `EventExternalResultsSyncState` DROP FOREIGN KEY `EventExternalResultsSyncState_eventId_fkey`;

-- AddForeignKey
ALTER TABLE `EventExternalResultsSyncState` ADD CONSTRAINT `EventExternalResultsSyncState_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
