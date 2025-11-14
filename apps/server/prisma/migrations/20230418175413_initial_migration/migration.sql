-- CreateTable
CREATE TABLE `Sport` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Sport_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `firstname` VARCHAR(191) NOT NULL,
    `lastname` VARCHAR(191) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Event` (
    `id` VARCHAR(191) NOT NULL,
    `sportId` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `organizer` VARCHAR(191) NULL,
    `date` DATE NOT NULL,
    `location` VARCHAR(191) NULL,
    `zeroTime` DATETIME NOT NULL,
    `relay` BOOLEAN NOT NULL DEFAULT false,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `authorId` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Class` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `length` INTEGER NULL,
    `climb` INTEGER NULL,
    `controlsCount` INTEGER NULL,
    `competitorsCount` INTEGER NULL,
    `printedMaps` INTEGER NULL,
    `minAge` INTEGER NULL,
    `maxAge` INTEGER NULL,
    `minTeamMembers` INTEGER NULL,
    `maxTeamMembers` INTEGER NULL,
    `sex` ENUM('B', 'M', 'F') NOT NULL DEFAULT 'B',
    `status` ENUM('NORMAL', 'DIVIDED', 'JOINED', 'INVALIDATED', 'INVALIDATEDNOFEE') NOT NULL DEFAULT 'NORMAL',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Competitor` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `classId` INTEGER UNSIGNED NOT NULL,
    `firstname` VARCHAR(191) NOT NULL,
    `lastname` VARCHAR(191) NOT NULL,
    `nationality` CHAR(3) NULL,
    `registration` VARCHAR(10) NOT NULL,
    `license` CHAR(1) NULL,
    `ranking` INTEGER UNSIGNED NULL,
    `organisation` VARCHAR(191) NULL,
    `shortName` VARCHAR(10) NULL,
    `card` INTEGER UNSIGNED NULL,
    `startTime` DATETIME(3) NULL,
    `finishTime` DATETIME(3) NULL,
    `time` INTEGER NULL,
    `teamId` INTEGER UNSIGNED NULL,
    `leg` INTEGER UNSIGNED NULL,
    `status` ENUM('OK', 'Finished', 'MissingPunch', 'Disqualified', 'DidNotFinish', 'Active', 'Inactive', 'OverTime', 'SportingWithdrawal', 'NotCompeting', 'Moved', 'MovedUp', 'DidNotStart', 'DidNotEnter', 'Cancelled') NOT NULL DEFAULT 'Inactive',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Team` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `classId` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `organisation` VARCHAR(191) NULL,
    `shortName` VARCHAR(10) NULL,
    `bibNumber` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_sportId_fkey` FOREIGN KEY (`sportId`) REFERENCES `Sport`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Class` ADD CONSTRAINT `Class_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competitor` ADD CONSTRAINT `Competitor_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Competitor` ADD CONSTRAINT `Competitor_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Team` ADD CONSTRAINT `Team_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
