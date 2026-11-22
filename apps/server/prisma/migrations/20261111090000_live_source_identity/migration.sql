ALTER TABLE `LiveDevice` ADD COLUMN `sourceId` VARCHAR(36) NULL;
CREATE UNIQUE INDEX `LiveDevice_eventId_sourceType_sourceId_key` ON `LiveDevice`(`eventId`, `sourceType`, `sourceId`);

ALTER TABLE `Event` ADD COLUMN `yarocSettings` JSON NULL;
