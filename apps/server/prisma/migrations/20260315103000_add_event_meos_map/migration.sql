-- CreateTable
CREATE TABLE `EventMeosMap` (
    `competitionId` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EventMeosMap_eventId_key`(`eventId`),
    PRIMARY KEY (`competitionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventMeosMap` ADD CONSTRAINT `EventMeosMap_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
