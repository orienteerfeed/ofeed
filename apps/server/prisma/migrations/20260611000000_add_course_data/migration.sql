-- CreateTable
CREATE TABLE `CourseMap` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(64) NULL,
    `scale` DOUBLE NULL,
    `mapTopLeftX` DOUBLE NULL,
    `mapTopLeftY` DOUBLE NULL,
    `mapBottomRightX` DOUBLE NULL,
    `mapBottomRightY` DOUBLE NULL,
    `mapPositionUnit` ENUM('PX', 'MM') NOT NULL DEFAULT 'MM',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CourseMap_event_idx`(`eventId`),
    UNIQUE INDEX `CourseMap_event_external_uq`(`eventId`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Control` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `type` ENUM('CONTROL', 'START', 'FINISH', 'CROSSING_POINT', 'END_OF_MARKED_ROUTE') NOT NULL DEFAULT 'CONTROL',
    `radio` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(128) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `altitude` DOUBLE NULL,
    `mapX` DOUBLE NULL,
    `mapY` DOUBLE NULL,
    `mapUnit` ENUM('PX', 'MM') NOT NULL DEFAULT 'MM',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Control_event_type_idx`(`eventId`, `type`),
    INDEX `Control_event_radio_idx`(`eventId`, `radio`),
    UNIQUE INDEX `Control_event_code_uq`(`eventId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Course` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(64) NULL,
    `name` VARCHAR(128) NOT NULL,
    `courseFamily` VARCHAR(128) NULL,
    `length` DOUBLE NULL,
    `climb` DOUBLE NULL,
    `controlsCount` INTEGER UNSIGNED NULL,
    `externalMapId` VARCHAR(64) NULL,
    `mapId` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Course_event_idx`(`eventId`),
    INDEX `Course_family_idx`(`courseFamily`),
    INDEX `Course_map_idx`(`mapId`),
    UNIQUE INDEX `Course_event_name_uq`(`eventId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseControl` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `courseId` INTEGER UNSIGNED NOT NULL,
    `controlId` INTEGER UNSIGNED NULL,
    `controlCode` VARCHAR(32) NOT NULL,
    `sequence` INTEGER UNSIGNED NOT NULL,
    `type` ENUM('CONTROL', 'START', 'FINISH', 'CROSSING_POINT', 'END_OF_MARKED_ROUTE') NULL,
    `mapText` VARCHAR(32) NULL,
    `mapTextX` DOUBLE NULL,
    `mapTextY` DOUBLE NULL,
    `mapTextUnit` ENUM('PX', 'MM') NULL,
    `legLength` DOUBLE NULL,
    `score` DOUBLE NULL,
    `randomOrder` BOOLEAN NOT NULL DEFAULT false,
    `specialInstruction` ENUM('NONE', 'TAPED_ROUTE', 'FUNNEL_TAPED_ROUTE', 'MANDATORY_CROSSING_POINT', 'MANDATORY_OUT_OF_BOUNDS_AREA_PASSAGE') NOT NULL DEFAULT 'NONE',
    `tapedRouteLength` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CourseControl_course_idx`(`courseId`),
    INDEX `CourseControl_control_idx`(`controlId`),
    UNIQUE INDEX `CourseControl_course_sequence_uq`(`courseId`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Class` ADD COLUMN `courseId` INTEGER UNSIGNED NULL;

-- CreateIndex
CREATE INDEX `Class_course_idx` ON `Class`(`courseId`);

-- AddForeignKey
ALTER TABLE `CourseMap` ADD CONSTRAINT `CourseMap_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Control` ADD CONSTRAINT `Control_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Course` ADD CONSTRAINT `Course_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Course` ADD CONSTRAINT `Course_mapId_fkey` FOREIGN KEY (`mapId`) REFERENCES `CourseMap`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseControl` ADD CONSTRAINT `CourseControl_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseControl` ADD CONSTRAINT `CourseControl_controlId_fkey` FOREIGN KEY (`controlId`) REFERENCES `Control`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Class` ADD CONSTRAINT `Class_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
