-- AlterTable
ALTER TABLE `EventImportState` MODIFY `sourceType` ENUM('IOF_XML', 'MEOS') NOT NULL;

-- AlterTable
ALTER TABLE `Class` MODIFY COLUMN `externalId` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Class_event_external_uq` ON `Class`(`eventId`, `externalId`);

-- CreateTable
CREATE TABLE `EventMeosBinding` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventMeosBinding_eventId_key`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventMeosBinding` ADD CONSTRAINT `EventMeosBinding_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
